import asyncio

import base64

import json

import logging

import os
import re

from typing import Any, AsyncIterator, Dict, List, Literal, Optional, Union



from dotenv import load_dotenv



load_dotenv()

logger = logging.getLogger("outlrn")



from fastapi import FastAPI, Request

from fastapi.middleware.cors import CORSMiddleware

from fastapi.responses import StreamingResponse

from openai import AsyncOpenAI, BadRequestError

from pydantic import BaseModel, field_validator



# ---------------------------------------------------------------------------

# App & Client

# ---------------------------------------------------------------------------

app = FastAPI(

    title="Outlrn Fast API",

    description="Outlrn FastAPI application â€” audio-driven orchestration",

    version="0.2.0",

)

app.add_middleware(

    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],

)



_client: Optional[AsyncOpenAI] = None

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or os.getenv("GROQ_API_KEY")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL") or os.getenv("GROQ_BASE_URL")

LLM_MODEL = os.getenv("LLM_MODEL", "gpt-5.1")
TTS_MODEL = os.getenv("TTS_MODEL", "gpt-4o-mini-tts")
TTS_VOICE = os.getenv("TTS_VOICE", "alloy")
JSON_MAX_TOKENS = int(os.getenv("JSON_MAX_TOKENS", "2800"))
SESSION_HISTORY_LIMIT = int(os.getenv("SESSION_HISTORY_LIMIT", "300"))
SESSION_MEMORY: Dict[str, List[dict]] = {}


def _safe_dump(value: Any, limit: int = 1200) -> str:

    """Best-effort compact JSON logging with truncation."""

    try:

        text = json.dumps(value, ensure_ascii=False)

    except Exception:

        text = str(value)

    if len(text) > limit:

        return text[:limit] + "...<truncated>"

    return text





def get_openai_client() -> AsyncOpenAI:

    global _client

    if _client is None:

        _client = AsyncOpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

    return _client





# ---------------------------------------------------------------------------

# Pydantic Models â€” action-based orchestrator contract

# ---------------------------------------------------------------------------



class CheckpointOption(BaseModel):

    label: str    # What the button says (e.g., "Yes, continue")

    value: str    # The hidden message sent back to the LLM (e.g., "proceed")



class OrchestratorAction(BaseModel):

    """One action emitted per orchestrator turn."""



    action: Literal["NARRATE", "SHOW_CONTENT", "SHOW_VISUAL", "ANIMATE", "EXPLAIN_CODE", "CHECKPOINT", "GRAPH_ANIMATE", "DONE"]



    # NARRATE â€” text the voice agent will speak

    script: Optional[str] = None



    # SHOW_CONTENT â€” brief content card

    content_title: Optional[str] = None

    content_body: Optional[Union[str, List[str]]] = None



    # SHOW_VISUAL â€” static visual (diagram / sandbox)

    visual_type: Optional[Literal["MERMAID", "BROWSER"]] = None

    visual_spec: Optional[str] = None



    # ANIMATE â€” step-by-step frame animation

    animation_type: Optional[str] = None  # e.g. "array_walk", "tree_traverse"

    animation_spec: Optional[Dict[str, Any]] = None  # config for the anim worker



    checkpoint_title: Optional[str] = None

    checkpoint_options: Optional[List[CheckpointOption]] = None



    # EXPLAIN_CODE â€” walk through code with synced line highlights

    code_language: Optional[str] = None       # e.g. "python", "javascript"

    code_spec: Optional[Dict[str, Any]] = None  # {description: "...", code: "..." (optional)}



    # GRAPH_ANIMATE â€” graph theory visualization

    graph_type: Optional[str] = None      # e.g. "bfs", "dfs", "dijkstra", "tree"

    graph_spec: Optional[Dict[str, Any]] = None  # {nodes: [...], edges: [...], start_node: "...", description: "..."}



    @field_validator("content_body", mode="before")

    @classmethod

    def ensure_body_is_string(cls, v):

        if isinstance(v, list):

            # Automatically format lists as markdown bullet points

            return "\n".join([f"- {str(item).strip('- ')}" for item in v])

        return v





# ---------------------------------------------------------------------------

# Orchestrator System Prompt

# ---------------------------------------------------------------------------

ORCHESTRATOR_SYSTEM_PROMPT = """\

You are "Mentor," a master educator on Outlrn. Your goal is to build deep mental models, not just deliver facts. You have full creative control over the lesson structure, choosing the best tools for the specific topic.



IMPORTANT: Respond ONLY with a valid JSON object.

Use valid JSON types. Keep text fields as strings, and keep structured payload fields
(`animation_spec`, `code_spec`, `graph_spec`, `checkpoint_options`) as proper JSON objects/arrays.

Do NOT use arrays/lists for content_body; use a single string with \\n for newlines.

## LESSON PLANNING (MANDATORY)

- Think one move ahead: decide the next 2-3 teaching beats before emitting the immediate action.
- Every beat must map to exactly one UI surface: concept card, code walkthrough, or visual animation.
- Emit actions in the exact sequence the student should experience on screen.

## PANEL ROUTING (MANDATORY)

- Concepts and summaries -> NARRATE (+ card) or SHOW_CONTENT.
- Code-first teaching -> EXPLAIN_CODE.
- Array/list motion -> ANIMATE.
- Trees/BST/AVL/traversals -> GRAPH_ANIMATE with tree-compatible graph_type values.
- Diagrams/architecture relationships -> SHOW_VISUAL.
- NEVER use SHOW_VISUAL(MERMAID) for tree or traversal teaching.



## THE MENTOR'S PHILOSOPHY

1. **Analogy-First:** Always anchor new concepts in something the student already knows.

2. **The "Problem" First:** Before explaining a solution (a concept), explain the specific problem that made that concept necessary.

3. **Scaffolding:** Never jump into complexity. Build the lesson piece-by-piece.

4. **Tool Selection:** - Use **ANIMATE** when data is moving in arrays/lists (sorting, searching).

   - Use **GRAPH_ANIMATE** when teaching graph theory (BFS, DFS, trees,BST, AVL, shortest paths, connected components, topological sort).

   - Use **EXPLAIN_CODE** when the implementation logic is the "main character."

   - Use **SHOW_VISUAL** (Mermaid) for architecture, flowcharts, or relationships.

   - Use **NARRATE + CARD** for concepts and summaries.

5. Never explain visuals using CARDS, Use the Corresponding Visuals for it eg. (Graphs, Arrays,etc.)



## THE DUAL-CODING RULE

- Every NARRATE action must include a `content_title` and `content_body`.

- The card acts as a "Visual Anchor." Keep titles punchy and bodies as 2-4 Markdown bullet points. No walls of text.



## DYNAMIC LESSON FLOW

You are responsible for the lesson's pace. Do not rush to the end.

1. **Analyze the History:** Look at what you have already taught. If you just finished an analogy, figure out if the next logical step is a technical definition, a diagram, or a code example.

2. **Determine Depth:** If a topic is complex (e.g., Recursion), break it into many small turns. If it's simple, move faster.

3. **Insert Checkpoints:** Do not narrate for too long without a pause. Use the **CHECKPOINT** action whenever:

   - You finish a major conceptual "chunk."

   - You are about to transition from "theory" to "technical implementation."

   - You want to check if the student is ready for a more difficult sub-topic.



## CONTINUATION & MEMORY

- **State Awareness:** Review previous 'assistant' messages. Never repeat a visual or a card you have already used.

- **Seamless Resume:** If the user clicks a button (e.g., "Yes, continue"), acknowledge their readiness briefly and move to the *next* logical piece of the curriculum.

- **The "Done" Rule:** Only emit `action: DONE` when the topic requested is fully exhausted and the student has seen the "How," the "Why," and the "Implementation."



## ACTION TOOLKIT

- **NARRATE:** Conceptual delivery. {"action":"NARRATE","script":"...","content_title":"...","content_body":"..."}

- **CHECKPOINT:** Interactive pause. {"action":"CHECKPOINT","script":"...","checkpoint_title":"...","checkpoint_options":[{"label":"...","value":"..."}]}

- **ANIMATE:** Step-by-step array/list logic. {"action":"ANIMATE","animation_type":"array_walk","animation_spec":{"array":[...],"description":"..."}}

- **EXPLAIN_CODE:** Line-by-line walkthrough. {"action":"EXPLAIN_CODE","code_language":"python","code_spec":{"description":"..."}}

- **SHOW_VISUAL:** Diagrams/UI. {"action":"SHOW_VISUAL","visual_type":"MERMAID","visual_spec":"..."}

- **GRAPH_ANIMATE:** Graph theory visualization. {"action":"GRAPH_ANIMATE","graph_type":"bfs","graph_spec":{"nodes":["A","B","C"],"edges":[["A","B"],["A","C"]],"start_node":"A","description":"BFS on a simple tree"}}

- **DONE:** End the lesson. {"action":"DONE"}

"""





# ---------------------------------------------------------------------------

# Helpers

# ---------------------------------------------------------------------------

def sse(data: dict) -> str:

    """Format a dict as a single SSE `data:` line."""

    return f"data: {json.dumps(data)}\n\n"





def b64(chunk: bytes) -> str:

    return base64.b64encode(chunk).decode("ascii")


TREE_GRAPH_HINTS = (
    "tree",
    "bst",
    "avl",
    "binary_tree",
    "inorder",
    "preorder",
    "postorder",
    "level_order",
)


def _infer_animation_component(animation_type: str, spec: Optional[dict] = None) -> str:
    kind = (animation_type or "").strip().lower()
    if any(token in kind for token in TREE_GRAPH_HINTS):
        return "TREE"
    if isinstance(spec, dict) and any(key in spec for key in ("nodes", "root", "tree")):
        return "TREE"
    return "ARRAY"


def _infer_graph_component(graph_type: str) -> str:
    kind = (graph_type or "").strip().lower()
    if any(token in kind for token in TREE_GRAPH_HINTS):
        return "TREE"
    return "NETWORK"


def _is_graph_animation_preferred(text: str) -> bool:

    t = (text or "").lower()

    graph_terms = (
        "traversal",
        "bfs",
        "dfs",
        "dijkstra",
        "shortest path",
        "connected component",
        "topological",
        "graph",
    )
    tree_terms = (
        "tree",
        "binary tree",
        "bst",
        "avl",
        "inorder",
        "preorder",
        "postorder",
        "level order",
    )

    return any(term in t for term in graph_terms) or any(term in t for term in tree_terms)


def _infer_graph_type_from_text(text: str) -> str:

    t = (text or "").lower()

    if "inorder" in t:
        return "inorder"
    if "preorder" in t:
        return "preorder"
    if "postorder" in t:
        return "postorder"
    if "level order" in t or "level-order" in t:
        return "level_order"
    if "bst" in t:
        return "bst"
    if "avl" in t:
        return "avl"
    if "dijkstra" in t or "shortest path" in t:
        return "dijkstra"
    if "dfs" in t:
        return "dfs"
    if "bfs" in t:
        return "bfs"
    if "tree" in t:
        return "tree"
    return "bfs"


def _normalize_orchestrator_action(action: OrchestratorAction) -> OrchestratorAction:

    if action.action != "SHOW_VISUAL":
        return action

    visual_type = (action.visual_type or "").upper()
    visual_spec = str(action.visual_spec or "")
    combined = f"{visual_type} {visual_spec}"

    if visual_type == "MERMAID" and _is_graph_animation_preferred(combined):
        inferred_graph_type = _infer_graph_type_from_text(combined)
        logger.warning(
            "[ORCHESTRATOR][ACTION_FIX] forcing GRAPH_ANIMATE graph_type=%s from SHOW_VISUAL spec=%s",
            inferred_graph_type,
            _safe_dump(visual_spec, 400),
        )
        return OrchestratorAction(
            action="GRAPH_ANIMATE",
            graph_type=inferred_graph_type,
            graph_spec={"description": visual_spec},
        )

    return action







def ensure_string_content(messages: List[dict]) -> List[dict]:

    """

    Ensures all message content is a string.

    If it's a dict or list, it stringifies it to avoid OpenAI 400 errors.

    """

    safe_history = []

    for m in messages:

        content = m.get("content", "")

       

        # If the content is already a list or dict,

        # convert it to a JSON string.

        if isinstance(content, (list, dict)):

            content = json.dumps(content)

           

        safe_history.append({

            "role": m["role"],

            "content": str(content) # Force cast to string

        })

    return safe_history


def _trim_history_in_place(history: List[dict], limit: int = SESSION_HISTORY_LIMIT) -> None:

    if limit <= 1 or len(history) <= limit:
        return

    if history and history[0].get("role") == "system":
        keep_tail = max(limit - 1, 0)
        tail = history[-keep_tail:] if keep_tail > 0 else []
        history[:] = [history[0], *tail]
        return

    history[:] = history[-limit:]


def _append_history_message(history: List[dict], role: str, content: Any) -> None:
    """Append one history message and enforce the in-memory session limit."""
    if isinstance(content, (dict, list)):
        text = json.dumps(content, ensure_ascii=False)
    else:
        text = str(content or "")

    text = text.strip()
    if not text:
        return

    history.append({"role": role, "content": text})
    _trim_history_in_place(history)


def _spoken_digest(lines: List[str], max_lines: int = 8, max_chars: int = 1600) -> str:
    """Compact spoken lines so follow-up turns remember what was said without prompt bloat."""
    cleaned = [str(line).strip() for line in lines if str(line).strip()]
    if not cleaned:
        return ""

    if len(cleaned) > max_lines:
        omitted = len(cleaned) - max_lines
        cleaned = cleaned[:max_lines] + [f"... ({omitted} additional spoken steps omitted)"]

    merged = " ".join(cleaned)
    if len(merged) > max_chars:
        merged = merged[: max_chars - 3].rstrip() + "..."

    return merged



# ---------------------------------------------------------------------------

# Animation array recovery helpers

# ---------------------------------------------------------------------------

def _to_number(token: str) -> Optional[Union[int, float]]:

    token = token.strip()

    if re.fullmatch(r"-?\d+", token):

        return int(token)

    if re.fullmatch(r"-?\d*\.\d+", token):

        return float(token)

    return None



def _extract_numeric_array_from_text(text: str) -> Optional[List[Union[int, float]]]:

    if not text:

        return None

    # Prefer bracketed lists: [1, 2, 3]
    for match in re.finditer(r"\[([^\[\]]+)\]", text):

        chunk = match.group(1)

        numbers = re.findall(r"-?\d+(?:\.\d+)?", chunk)

        parsed = [_to_number(n) for n in numbers]

        values = [v for v in parsed if v is not None]

        if len(values) >= 2:

            return values

    # Fallback: comma-separated sequence outside brackets: 1, 2, 3
    for match in re.finditer(r"-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)+", text):

        chunk = match.group(0)

        numbers = re.findall(r"-?\d+(?:\.\d+)?", chunk)

        parsed = [_to_number(n) for n in numbers]

        values = [v for v in parsed if v is not None]

        if len(values) >= 2:

            return values

    # Fallback: whitespace-separated sequence outside brackets: "2 7 9 15 20 24 18"
    # Require >=3 values so we don't accidentally capture tiny numeric fragments.
    for match in re.finditer(r"-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?){2,}", text):

        chunk = match.group(0)

        numbers = re.findall(r"-?\d+(?:\.\d+)?", chunk)

        parsed = [_to_number(n) for n in numbers]

        values = [v for v in parsed if v is not None]

        if len(values) >= 3:

            return values

    return None



def _coerce_numeric_array(value: Any) -> Optional[List[Union[int, float]]]:

    if not isinstance(value, list):

        return None

    out: List[Union[int, float]] = []

    for item in value:

        if isinstance(item, bool):

            return None

        if isinstance(item, (int, float)):

            out.append(item)

            continue

        if isinstance(item, str):

            n = _to_number(item)

            if n is None:

                return None

            out.append(n)

            continue

        return None

    return out



def _looks_collapsed_singleton_array(value: Any) -> bool:

    arr = _coerce_numeric_array(value)

    if not arr or len(arr) != 1:

        return False

    one = arr[0]

    if isinstance(one, float) and one.is_integer():

        one = int(one)

    if isinstance(one, int):

        return abs(one) >= 100000

    return False



def _number_token(value: Union[int, float]) -> str:

    if isinstance(value, float) and value.is_integer():

        return str(int(value))

    return str(value)


def _decode_collapsed_array_with_reference(
    value: Any, reference: Optional[List[Union[int, float]]]
) -> Optional[List[Union[int, float]]]:

    arr = _coerce_numeric_array(value)

    if not arr or len(arr) != 1:

        return None

    if not reference or len(reference) < 2:

        return None

    source = arr[0]

    if isinstance(source, float) and source.is_integer():

        source = int(source)

    text = str(source).strip()

    if not text:

        return None

    token_values: Dict[str, Union[int, float]] = {}
    token_counts: Dict[str, int] = {}

    for n in reference:

        token = _number_token(n)
        token_values[token] = n
        token_counts[token] = token_counts.get(token, 0) + 1

    tokens = sorted(token_counts.keys(), key=len, reverse=True)
    initial_state = tuple(token_counts[t] for t in tokens)

    from functools import lru_cache

    @lru_cache(maxsize=4096)
    def _solve(pos: int, state: tuple[int, ...]) -> Optional[tuple[str, ...]]:

        if pos == len(text):

            return tuple() if sum(state) == 0 else None

        if sum(state) == 0:

            return None

        for idx, token in enumerate(tokens):

            remaining = state[idx]

            if remaining <= 0:

                continue

            if not text.startswith(token, pos):

                continue

            next_state = list(state)
            next_state[idx] -= 1
            suffix = _solve(pos + len(token), tuple(next_state))

            if suffix is not None:

                return (token,) + suffix

        return None

    resolved = _solve(0, initial_state)

    if not resolved or len(resolved) != len(reference):

        return None

    return [token_values[t] for t in resolved]


def _recover_collapsed_frame_array(
    value: Any,
    prev_array: Optional[List[Union[int, float]]],
    base_array: Optional[List[Union[int, float]]],
) -> Optional[List[Union[int, float]]]:

    for ref in (prev_array, base_array):

        recovered = _decode_collapsed_array_with_reference(value, ref)

        if recovered:

            return recovered

    arr = _coerce_numeric_array(value)

    if not arr or len(arr) != 1:

        return None

    one = arr[0]

    if isinstance(one, float) and one.is_integer():

        one = int(one)

    if not isinstance(one, int) or one < 0:

        return None

    text = str(one)
    expected = len(prev_array or base_array or [])

    if expected >= 2 and len(text) == expected and text.isdigit():

        return [int(ch) for ch in text]

    return None


def _decode_compact_indices(value: Any, size: int) -> List[int]:

    if size <= 0:

        return []

    parts: List[str] = []

    if isinstance(value, int):

        if value < 0:

            return []

        parts = list(str(value))

    elif isinstance(value, str):

        text = value.strip()

        if not text.isdigit():

            return []

        parts = list(text)

    else:

        return []

    out: List[int] = []

    for part in parts:

        idx = _coerce_index(part, size)

        if idx is not None and idx not in out:

            out.append(idx)

    return out


def _is_swap_completion_label(label: str) -> bool:

    text = (label or "").strip().lower()

    if not text:

        return False

    if "no swap" in text or "do not swap" in text or "don't swap" in text:

        return False

    if "should we swap" in text and "swapped" not in text and "swap done" not in text:

        return False

    if "swap?" in text and "swapped" not in text:

        return False

    if "?" in text and "swapped" not in text and "exchang" not in text:

        return False

    return ("swapped" in text) or ("swap" in text) or ("exchang" in text)


def _pick_swap_indices(
    pointers: Dict[str, int], highlights: List[int], size: int
) -> Optional[tuple[int, int]]:

    idxs = [i for i in highlights if _coerce_index(i, size) is not None]

    if len(idxs) >= 2:

        a, b = idxs[0], idxs[1]

        if a != b:

            return (a, b)

    pointer_values = [v for v in pointers.values() if _coerce_index(v, size) is not None]
    unique_pointer_values: List[int] = []

    for v in pointer_values:

        if v not in unique_pointer_values:

            unique_pointer_values.append(v)

    if len(unique_pointer_values) >= 2:

        a, b = unique_pointer_values[0], unique_pointer_values[1]

        if a != b:

            return (a, b)

    return None


def _requires_multi_element_array(animation_type: Optional[str], description: str) -> bool:

    kind = (animation_type or "").lower()

    text = (description or "").lower()

    signals = (
        "array",
        "walk",
        "sort",
        "search",
        "swap",
        "pointer",
        "bubble",
        "selection",
        "insertion",
        "merge",
        "quick",
        "partition",
        "binary",
    )

    return any(sig in kind for sig in signals) or any(sig in text for sig in signals)


def _is_internal_backend_feedback(text: str) -> bool:

    if "What is your next action?" not in text:

        return False

    prefixes = (
        "Narration delivered to student",
        "Content card '",
        "Visual generated and shown to student.",
        "Animation complete (",
        "Code explanation complete (",
        "Graph animation complete (",
        "That action was not understood.",
    )

    return any(text.startswith(prefix) for prefix in prefixes)



def _latest_real_user_message(messages: List[dict]) -> Optional[str]:

    for msg in reversed(messages):

        if msg.get("role") != "user":

            continue

        content = str(msg.get("content", "") or "").strip()

        if not content:

            continue

        if _is_internal_backend_feedback(content):

            continue

        return content

    return None



def _resolve_animation_array(
    animation_spec: Dict[str, Any], messages: List[dict], animation_type: Optional[str] = None
) -> tuple[Optional[List[Union[int, float]]], Optional[str]]:

    current = _coerce_numeric_array(animation_spec.get("array"))
    description = str(animation_spec.get("description", "") or "")
    requires_multi = _requires_multi_element_array(animation_type, description)

    # Keep clearly-valid arrays as-is
    if current:
        if len(current) >= 2:
            return current, None

        if len(current) == 1 and not requires_multi and not _looks_collapsed_singleton_array(current):
            return current, None

    user_text = _latest_real_user_message(messages)

    if user_text:

        from_user = _extract_numeric_array_from_text(user_text)

        if from_user:

            return from_user, "latest_user_prompt"

    from_description = _extract_numeric_array_from_text(description)

    if from_description:

        return from_description, "description"

    # Final fallback: if the model produced an obviously collapsed singleton
    # and we cannot recover an explicit list, use a sane template array.
    if _looks_collapsed_singleton_array(current) or not current or (
        requires_multi and current is not None and len(current) < 2
    ):

        description_lc = description.lower()

        if "binary" in description_lc and "search" in description_lc:

            return [1, 3, 5, 7, 9, 11, 13], "default_template_binary_search"

        if "search" in description_lc:

            return [5, 12, 7, 39, 15, 8], "default_template_search"

        if "sort" in description_lc:

            return [5, 3, 8, 1, 2, 7], "default_template_sort"

        return [4, 1, 7, 3, 9], "default_template_generic"

    return current, None


def _coerce_index(value: Any, size: int) -> Optional[int]:

    if size <= 0:
        return None

    if isinstance(value, bool) or value is None:
        return None

    parsed: Optional[int] = None

    if isinstance(value, int):
        parsed = value
    elif isinstance(value, float):
        parsed = int(value) if value.is_integer() else None
    elif isinstance(value, str):
        text = value.strip()
        if re.fullmatch(r"-?\d+", text):
            parsed = int(text)

    if parsed is None:
        return None

    if parsed < 0 or parsed >= size:
        return None

    return parsed


def _normalize_active_range(value: Any, size: int, pointers: Dict[str, int]) -> Optional[List[int]]:

    if size <= 0:
        return None

    if isinstance(value, list):
        if len(value) >= 2:
            a = _coerce_index(value[0], size)
            b = _coerce_index(value[1], size)
            if a is not None and b is not None:
                lo, hi = sorted((a, b))
                return [lo, hi]
        elif len(value) == 1:
            value = value[0]
        else:
            value = None

    if isinstance(value, str):
        digits = re.findall(r"\d", value)
        if len(digits) >= 2:
            a = _coerce_index(int(digits[0]), size)
            b = _coerce_index(int(digits[-1]), size)
            if a is not None and b is not None:
                lo, hi = sorted((a, b))
                return [lo, hi]
        one = _coerce_index(value, size)
        if one is not None:
            return [one, one]

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        n = int(value)
        if n >= 10:
            digits = re.findall(r"\d", str(abs(n)))
            if len(digits) >= 2:
                a = _coerce_index(int(digits[0]), size)
                b = _coerce_index(int(digits[-1]), size)
                if a is not None and b is not None:
                    lo, hi = sorted((a, b))
                    return [lo, hi]
        one = _coerce_index(value, size)
        if one is not None:
            return [one, one]

    l_ptr = pointers.get("L", pointers.get("left"))
    r_ptr = pointers.get("R", pointers.get("right"))
    if l_ptr is not None and r_ptr is not None:
        lo, hi = sorted((l_ptr, r_ptr))
        return [lo, hi]

    return [0, size - 1] if size >= 2 else [0, 0]


def _sanitize_array_frames(
    frames: Any,
    fallback_array: Optional[List[Union[int, float]]] = None,
    requires_multi: bool = False,
) -> List[dict]:

    base = list(fallback_array or [])
    raw_frames = frames if isinstance(frames, list) else []
    safe_frames: List[dict] = []
    prev_array = list(base)

    for raw in raw_frames:
        src = raw if isinstance(raw, dict) else {}
        frame_array_raw = src.get("array")
        frame_array = _coerce_numeric_array(frame_array_raw)
        recovered_collapsed = _recover_collapsed_frame_array(
            frame_array_raw,
            prev_array if prev_array else None,
            base if base else None,
        )
        use_frame_array = (
            frame_array is not None
            and len(frame_array) >= 1
            and not _looks_collapsed_singleton_array(frame_array)
            and not (requires_multi and len(frame_array) < 2)
        )
        used_model_array = False
        if use_frame_array:
            current_array = list(frame_array)
            used_model_array = True
        elif recovered_collapsed is not None:
            current_array = list(recovered_collapsed)
            used_model_array = True
        elif prev_array:
            current_array = list(prev_array)
        else:
            current_array = list(base)

        size = len(current_array)

        pointer_map: Dict[str, int] = {}
        if isinstance(src.get("pointers"), dict):
            for k, v in src["pointers"].items():
                idx = _coerce_index(v, size)
                if idx is not None:
                    pointer_map[str(k)] = idx

        if not pointer_map and size > 0:
            pointer_map = {"i": 0}

        highlights: List[int] = []
        raw_highlights = src.get("highlights")
        if isinstance(raw_highlights, list):
            for item in raw_highlights:
                idx = _coerce_index(item, size)
                item_text = item.strip() if isinstance(item, str) else ""
                should_expand_compact = False
                if idx is None:
                    should_expand_compact = True
                elif (
                    isinstance(item, str)
                    and len(item_text) >= 2
                    and item_text.isdigit()
                    and item_text.startswith("0")
                ):
                    should_expand_compact = True

                if should_expand_compact:
                    for compact_idx in _decode_compact_indices(item, size):
                        if compact_idx not in highlights:
                            highlights.append(compact_idx)
                    continue

                if idx is not None and idx not in highlights:
                    highlights.append(idx)

        if not highlights:
            for _, idx in pointer_map.items():
                if idx not in highlights:
                    highlights.append(idx)

        if not highlights and size > 0:
            highlights = [0]

        active_range = _normalize_active_range(src.get("activeRange"), size, pointer_map)

        label = str(src.get("label", "") or "").strip()
        if not label:
            label = "Follow the highlighted indices for this step."

        if (
            not used_model_array
            and prev_array
            and len(prev_array) == size
            and _is_swap_completion_label(label)
        ):
            swap_pair = _pick_swap_indices(pointer_map, highlights, size)
            if swap_pair:
                a, b = swap_pair
                swapped = list(current_array)
                swapped[a], swapped[b] = swapped[b], swapped[a]
                current_array = swapped

        sanitized = dict(src)
        sanitized["array"] = current_array
        sanitized["pointers"] = pointer_map
        sanitized["highlights"] = highlights
        sanitized["activeRange"] = active_range
        sanitized["label"] = label

        safe_frames.append(sanitized)
        prev_array = current_array

    if not safe_frames:
        if base:
            default_range = [0, len(base) - 1] if len(base) >= 2 else [0, 0]
            return [
                {
                    "array": list(base),
                    "pointers": {"i": 0},
                    "highlights": [0],
                    "activeRange": default_range,
                    "label": "Start with the initial array state.",
                }
            ]
        return []

    return safe_frames


def _deterministic_array_narration(
    frame: dict, index: int, total: int, prev_frame: Optional[dict] = None
) -> str:

    arr = _coerce_numeric_array(frame.get("array")) or []
    label = str(frame.get("label", "") or "").strip()
    pointers = frame.get("pointers") if isinstance(frame.get("pointers"), dict) else {}
    highlights = frame.get("highlights") if isinstance(frame.get("highlights"), list) else []
    active_range = (
        frame.get("activeRange")
        if isinstance(frame.get("activeRange"), list) and len(frame.get("activeRange")) >= 2
        else None
    )

    prev_arr = _coerce_numeric_array(prev_frame.get("array")) if isinstance(prev_frame, dict) else None
    prev_label = str(prev_frame.get("label", "") or "").strip() if isinstance(prev_frame, dict) else ""
    prev_pointers = (
        prev_frame.get("pointers") if isinstance(prev_frame, dict) and isinstance(prev_frame.get("pointers"), dict) else {}
    )
    prev_highlights = (
        prev_frame.get("highlights") if isinstance(prev_frame, dict) and isinstance(prev_frame.get("highlights"), list) else []
    )
    prev_active_range = (
        prev_frame.get("activeRange")
        if isinstance(prev_frame, dict)
        and isinstance(prev_frame.get("activeRange"), list)
        and len(prev_frame.get("activeRange")) >= 2
        else None
    )

    def _label_is_consistent(text: str) -> bool:
        if not text:
            return True

        for m in re.finditer(r"index\s+(\d+)", text.lower()):
            idx = _coerce_index(m.group(1), len(arr))
            if idx is None:
                return False

        checks: List[tuple[str, str]] = []
        for m in re.finditer(
            r"value\s+(-?\d+(?:\.\d+)?)\s+at\s+index\s+(\d+)",
            text.lower(),
        ):
            checks.append((m.group(2), m.group(1)))
        for m in re.finditer(
            r"index\s+(\d+)[^\n\r\.]*?value\s+(-?\d+(?:\.\d+)?)",
            text.lower(),
        ):
            checks.append((m.group(1), m.group(2)))

        for idx_raw, val_raw in checks:
            idx = _coerce_index(idx_raw, len(arr))
            val = _to_number(val_raw)
            if idx is None or val is None:
                return False
            if arr[idx] != val:
                return False

        return True

    focus_bits: List[str] = []
    for raw_idx in highlights[:2]:
        idx = _coerce_index(raw_idx, len(arr))
        if idx is None:
            continue
        focus_bits.append(f"index {idx} has value {arr[idx]}")

    pointer_bits: List[str] = []
    for key in sorted(pointers.keys()):
        idx = _coerce_index(pointers.get(key), len(arr))
        if idx is not None:
            pointer_bits.append(f"{key}={idx}")

    prev_focus_bits: List[str] = []
    for raw_idx in prev_highlights[:2]:
        idx = _coerce_index(raw_idx, len(prev_arr or []))
        if idx is None or not prev_arr:
            continue
        prev_focus_bits.append(f"index {idx} has value {prev_arr[idx]}")

    prev_pointer_bits: List[str] = []
    for key in sorted(prev_pointers.keys()):
        idx = _coerce_index(prev_pointers.get(key), len(prev_arr or arr))
        if idx is not None:
            prev_pointer_bits.append(f"{key}={idx}")

    parts: List[str] = []
    label_is_fresh = label and label.casefold() != prev_label.casefold()
    if label and label_is_fresh and _label_is_consistent(label):
        parts.append(label.rstrip("."))
    if focus_bits and (index == 0 or focus_bits != prev_focus_bits):
        parts.append("Focus: " + ", ".join(focus_bits))
    if pointer_bits and (index == 0 or pointer_bits != prev_pointer_bits):
        parts.append("Pointers: " + ", ".join(pointer_bits))

    if active_range:
        curr_l = _coerce_index(active_range[0], len(arr))
        curr_r = _coerce_index(active_range[1], len(arr))
        prev_l = _coerce_index(prev_active_range[0], len(arr)) if prev_active_range else None
        prev_r = _coerce_index(prev_active_range[1], len(arr)) if prev_active_range else None
        if curr_l is not None and curr_r is not None and (index == 0 or curr_l != prev_l or curr_r != prev_r):
            parts.append(f"Search window is now [{curr_l}, {curr_r}]")

    if prev_arr and arr and arr != prev_arr:
        changed: List[str] = []
        for i, (a, b) in enumerate(zip(prev_arr, arr)):
            if a != b:
                changed.append(f"index {i} -> {b}")
            if len(changed) >= 2:
                break
        if changed:
            parts.append("Array update: " + ", ".join(changed))

    if not parts and index < total - 1:
        parts.append("Proceeding to the next decision point")

    if index == total - 1:
        if "not found" in label.lower():
            parts.append("This finishes the walkthrough with the target not found")
        else:
            parts.append("This completes this array walkthrough")

    narration = ". ".join(p for p in parts if p).strip()
    if not narration:
        narration = f"Step {index + 1} of {total}."

    if not narration.endswith("."):
        narration += "."

    return narration



# ---------------------------------------------------------------------------

# get_next_action â€” ask the orchestrator LLM for its next move

# ---------------------------------------------------------------------------

async def get_next_action(messages: List[dict], _retries: int = 3) -> OrchestratorAction:

    safe_history = ensure_string_content(messages)

    last_err = None

    for attempt in range(_retries):

        try:

            response = await get_openai_client().chat.completions.create(

                model=LLM_MODEL,

                messages=safe_history,

                response_format={"type": "json_object"},

                temperature=0.2,

            )

            content = response.choices[0].message.content or ""

            if not content.strip():

                raise ValueError("Empty JSON response from LLM")

            raw = json.loads(content)

            return OrchestratorAction(**raw)

        except Exception as e:

            last_err = e

            logger.warning(f"get_next_action attempt {attempt+1}/{_retries} failed: {e}")

            if attempt < _retries - 1:

                await asyncio.sleep(1)

    raise last_err





# ---------------------------------------------------------------------------

# WORKER â€” Voice (streaming TTS)

# ---------------------------------------------------------------------------

AUDIO_CHUNK_SIZE = 4096





async def voice_stream(script: str) -> AsyncIterator[bytes]:

    """Yield raw MP3 chunks the instant they arrive from OpenAI TTS."""

    async with get_openai_client().audio.speech.with_streaming_response.create(

        model=TTS_MODEL,

        voice=TTS_VOICE,

        input=script,

        response_format="mp3",

    ) as response:

        async for chunk in response.iter_bytes(chunk_size=AUDIO_CHUNK_SIZE):

            yield chunk





# ---------------------------------------------------------------------------

# WORKER â€” Mermaid diagram

# ---------------------------------------------------------------------------

MERMAID_SYSTEM_PROMPT = """\

You are an expert Mermaid.js diagram artist.

Given a concept, return ONLY valid JSON

Return ONLY a valid JSON object with the following keys: "diagram_type", "code", and "description"

{

  "diagram_type": "flowchart" | "sequenceDiagram" | "classDiagram",

  "code": "<valid mermaid code>",

  "description": "one-line description"

}

"""





async def mermaid_worker(spec: str) -> dict:

    response = await get_openai_client().chat.completions.create(

        model=LLM_MODEL,

        messages=[

            {"role": "system", "content": MERMAID_SYSTEM_PROMPT},

            {"role": "user", "content": spec},

        ],

        response_format={"type": "json_object"},
        temperature=0,

    )

    return json.loads(response.choices[0].message.content)





# ---------------------------------------------------------------------------

# WORKER â€” Browser UI sandbox

# ---------------------------------------------------------------------------

BROWSER_SYSTEM_PROMPT = """\

You are a UI Designer for an educational sandbox.

Create a PURE UI component using Tailwind CSS classes.

Output ONLY valid JSON:

{

  "component_type": "sandbox",

  "html": "<div class='...'>...</div>",

  "description": "one-line description"

}

"""





async def browser_ui_worker(spec: str) -> dict:

    response = await get_openai_client().chat.completions.create(

        model=LLM_MODEL,

        messages=[

            {"role": "system", "content": BROWSER_SYSTEM_PROMPT},

            {"role": "user", "content": spec},

        ],

        response_format={"type": "json_object"},
        temperature=0,

    )

    return json.loads(response.choices[0].message.content)





# ---------------------------------------------------------------------------

# DISPATCHER â€” routes to the right visual worker

# ---------------------------------------------------------------------------

async def generate_visual(visual_type: str, spec: str) -> dict:

    if visual_type == "MERMAID":

        return await mermaid_worker(spec)

    elif visual_type == "BROWSER":

        return await browser_ui_worker(spec)

    raise ValueError(f"Unknown visual_type: {visual_type}")





# ---------------------------------------------------------------------------

# WORKER â€” Animation frame generator

# ---------------------------------------------------------------------------

ANIMATION_SYSTEM_PROMPT = """\

You are a Visual Learning Designer. You create step-by-step frames for algorithm visualizations.

Goal: Every frame must represent a "Decision Point" in the algorithm.



IMPORTANT: Respond ONLY with a valid JSON object containing a "frames" array.



## MANDATORY FRAME FIELDS â€” every frame MUST include ALL of these:

{

  "array":       [<current state of the array â€” update after swaps/moves>],

  "pointers":    {"<LabelName>": <index>, ...},

  "highlights":  [<indices being compared or acted on>],

  "activeRange": [<start>, <end>] | null,

  "label":       "<1-sentence explanation of the LOGIC of this step>"

}



## POINTERS ARE REQUIRED â€” never omit them.

`pointers` is an object mapping label names to array indices.

Use descriptive labels that match the algorithm:



  Binary search â†’ {"L": 0, "M": 4, "R": 9}

  Bubble sort   â†’ {"i": 0, "j": 1}

  Quick sort    â†’ {"pivot": 5, "i": 1, "j": 7}

  Two pointers  â†’ {"left": 0, "right": 9}

  Insertion sortâ†’ {"key": 3, "j": 2}

  Selection sortâ†’ {"min": 2, "i": 4}

  Linear search â†’ {"i": 3}

  Merge sort    â†’ {"l": 0, "m": 3, "r": 7}



Every frame MUST have at least one pointer. Pointers show WHERE the algorithm is looking.



## HIGHLIGHTS ARE REQUIRED.

`highlights` is an array of indices currently being compared, swapped, or inspected.

Every frame MUST highlight at least one index.



## Pedagogy Rules:

1. **The "Wait" State:** Before a major change (like a swap), create a frame where the elements are highlighted but NOT yet changed. Label: "Should we swap these?"

2. **Show the Comparison:** When comparing values, highlight both and label what you're checking.

3. **Active Range:** Use `activeRange` to dim the "solved" portions so the student stays focused.



## Visual Consistency:

1. **Persistent Labels:** Once a pointer is named (e.g., "pivot"), keep that exact name for the entire animation.

2. **Update the Array:** If the algorithm rearranges elements, `array` must reflect the new order in subsequent frames.

3. **No Skipped Steps:** Every logical step gets a frame, even near the end.
4. Keep output compact: generate 4-10 frames only.

## Accuracy Hard Rules (non-negotiable):

1. Every pointer and highlight index MUST be a valid integer index into `array`.
2. `activeRange` MUST be either `null` or a two-integer list `[start, end]` (never strings, never compressed forms like `[46]` or `["06"]`).
3. The `label` MUST match the frame data exactly. If you mention a value at an index, it must equal `array[index]`.
4. Never collapse arrays into concatenated numbers like `[135791113]`. Keep explicit element lists.
5. For binary search:
   - Keep the array unchanged across frames.
   - Use pointers `L`, `M`, `R`.
   - `activeRange` should match the current search window `[L, R]`.



## Concrete Example â€” Bubble Sort of [5, 3, 8, 1]:



{"frames": [

  {"array": [5,3,8,1], "pointers": {"i":0,"j":1}, "highlights": [0,1], "activeRange": null, "label": "Compare 5 and 3. 5 > 3, so we need to swap."},

  {"array": [3,5,8,1], "pointers": {"i":0,"j":1}, "highlights": [0,1], "activeRange": null, "label": "Swapped! 3 is now in place. Move j forward."},

  {"array": [3,5,8,1], "pointers": {"i":1,"j":2}, "highlights": [1,2], "activeRange": null, "label": "Compare 5 and 8. 5 < 8, no swap needed."},

  {"array": [3,5,8,1], "pointers": {"i":2,"j":3}, "highlights": [2,3], "activeRange": null, "label": "Compare 8 and 1. 8 > 1, swap them."},

  {"array": [3,5,1,8], "pointers": {"i":2,"j":3}, "highlights": [2,3], "activeRange": null, "label": "Swapped! 8 bubbled to the end. First pass done."}

]}

"""





# ---------------------------------------------------------------------------

# Code Explainer System Prompt

# ---------------------------------------------------------------------------

CODE_EXPLAINER_SYSTEM_PROMPT = """\

You are a Code Explanation Designer. You produce well-commented code and break it into logical segments for a step-by-step walkthrough.



IMPORTANT: Respond ONLY with a valid JSON object.



## Input

You receive a description of code to generate (or existing code to explain). Your job:

1. If no code is provided, write clean, idiomatic code for the described concept.

2. Break the code into logical segments â€” each segment is a contiguous range of lines that forms one conceptual unit.



## Output Format

{

  "code": "<the full source code>",

  "language": "python",

  "title": "Short title for the code card",

  "segments": [

    {"lines": [1, 3], "explanation": "Import statements and setup â€” we bring in the tools we need."},

    {"lines": [5, 12], "explanation": "The main function definition â€” this is where the core logic lives."},

    ...

  ]

}



## Rules

- `lines` uses 1-based inclusive line numbers: [startLine, endLine].

- Every line of code must belong to at least one segment. No gaps.

- Segments should NOT overlap.

- Each segment should cover 2â€“8 lines. Split large blocks; merge trivial one-liners with neighbors.

- `explanation` should be a 1â€“2 sentence description of WHAT this segment does and WHY, written for a learner.

- The code should be complete and runnable.

- Keep the code concise (under 60 lines ideally).

- Add brief inline comments only where the logic is non-obvious.

"""





async def generate_animation(animation_type: str, spec: dict) -> List[dict]:

    """Ask the LLM to produce a list of animation frames."""

    response = await get_openai_client().chat.completions.create(

        model=LLM_MODEL,

        messages=[

            {"role": "system", "content": ANIMATION_SYSTEM_PROMPT},

            {

                "role": "user",

                "content": json.dumps(

                    {"animation_type": animation_type, **spec}

                ),

            },

        ],

        response_format={"type": "json_object"},
        temperature=0,
        max_tokens=JSON_MAX_TOKENS,

    )

    raw_content = response.choices[0].message.content or "{}"

    logger.warning(

        "[ANIMATE][LLM_RAW] type=%s spec=%s response=%s",

        animation_type,

        _safe_dump(spec, 600),

        _safe_dump(raw_content, 2400),

    )

    raw = json.loads(raw_content)

    frames = raw.get("frames", [])

    first_frame_array = frames[0].get("array") if frames else None

    logger.warning(

        "[ANIMATE][PARSED] frame_count=%s first_array_type=%s first_array=%s",

        len(frames),

        type(first_frame_array).__name__ if first_frame_array is not None else "None",

        _safe_dump(first_frame_array, 600),

    )

    return frames





# ---------------------------------------------------------------------------

# WORKER â€” Code explanation generator

# ---------------------------------------------------------------------------

async def generate_code_explanation(code_language: str, spec: dict) -> dict:

    """Ask the LLM to produce code + segmented explanation."""

    user_content = {"language": code_language}

    if spec.get("code"):

        user_content["code"] = spec["code"]

    if spec.get("description"):

        user_content["description"] = spec["description"]



    response = await get_openai_client().chat.completions.create(

        model=LLM_MODEL,

        messages=[

            {"role": "system", "content": CODE_EXPLAINER_SYSTEM_PROMPT},

            {"role": "user", "content": json.dumps(user_content)},

        ],

        response_format={"type": "json_object"},
        temperature=0,
        max_tokens=JSON_MAX_TOKENS,

    )

    raw = json.loads(response.choices[0].message.content)

    return {

        "code": raw.get("code", ""),

        "language": raw.get("language", code_language),

        "title": raw.get("title", "Code"),

        "segments": raw.get("segments", []),

    }





# ---------------------------------------------------------------------------

# WORKER â€” Graph animation frame generator

# ---------------------------------------------------------------------------

GRAPH_ANIMATION_SYSTEM_PROMPT = """\

You are a Visual Learning Designer for graph algorithms. You create step-by-step frames for graph traversal and algorithm visualizations.



IMPORTANT: Respond ONLY with a valid JSON object containing a "graph" object and a "frames" array.



## OUTPUT FORMAT:

{

  "graph": {

    "nodes": [

      {"id": "A", "label": "A", "x": 200, "y": 40},

      {"id": "B", "label": "B", "x": 100, "y": 140},

      ...

    ],

    "edges": [

      {"from": "A", "to": "B"},

      {"from": "A", "to": "C"},

      ...

    ],

    "directed": true

  },

  "frames": [

    {

      "visitedNodes": [],

      "activeNode": "A",

      "visitedEdges": [],

      "activeEdge": null,

      "frontier": ["A"],

      "label": "Start at node A. Add it to the queue."

    },

    ...

  ]

}



## GRAPH OBJECT RULES:

- `nodes`: Array of {id, label, x, y}. Positions are in a 400Ã—300 normalized viewport.

  - x ranges from 20 to 380, y ranges from 20 to 280.

  - Space nodes so labels don't overlap. Trees: root at top center, layers below.

  - General graphs: spread nodes in a visually clear layout.

- `edges`: Array of {from, to} referencing node IDs.

- `directed`: true for directed graphs, false for undirected.

- Node positions are defined ONCE in the graph object and stay fixed across all frames.



## FRAME FIELDS â€” every frame MUST include ALL of these:

{

  "activeNodes": ["A", "B", "C"],

  "activeNode": "C",

  "activeEdges": [["A","B"], ["B","C"]],

  "activeEdge": ["B", "C"],

  "visitedNodes": ["A", "B", "C"],

  "visitedEdges": [["A","B"], ["B","C"]],

  "frontier": ["D", "E"],

  "label": "Dequeue B. Visit neighbor C, add it to the queue."

}

Notes:
- activeNodes: nodes to visually highlight this frame.
- activeNode: the node currently being processed (or null).
- activeEdges: edges to visually highlight this frame.
- activeEdge: currently traversed edge (or null).
- visitedNodes: IDs of all nodes visited so far.
- visitedEdges: traversed edges as [from, to] pairs.
- frontier: current queue/stack/priority queue contents.



## Pedagogy Rules:

1. **The "Start" Frame:** First frame shows the starting node highlighted, frontier initialized. Label explains the initial state.

2. **Show the Decision:** Before visiting a node, show it as the activeNode and explain why it's being selected (e.g., "It's at the front of the queue").

3. **Show the Traversal:** When moving along an edge, highlight it as activeEdge. Label explains the traversal.

4. **Update Frontier:** Each frame must accurately show the current frontier (queue for BFS, stack for DFS, priority queue for Dijkstra).

5. **Cumulative Progress:** visitedNodes and visitedEdges grow monotonically. Never remove a visited node/edge.

6. **Final Frame:** All reachable nodes are visited, frontier is empty. Label: "All nodes visited! Traversal complete."
7. Keep output compact: generate 5-12 frames only.



## Graph Design Tips:

- For BFS/DFS demos: Use 6â€“10 nodes. Create a graph with enough branching to make the algorithm interesting.

- For tree traversals: Use a balanced or slightly unbalanced tree with 7â€“15 nodes.

- For Dijkstra: Add "weight" field to edges, use 5â€“8 nodes.

- Keep graphs simple enough to teach clearly but complex enough to show the algorithm's behavior.

"""





async def generate_graph_animation(graph_type: str, spec: dict) -> dict:

    """Ask the LLM to produce graph structure and animation frames."""

    response = await get_openai_client().chat.completions.create(

        model=LLM_MODEL,

        messages=[

            {"role": "system", "content": GRAPH_ANIMATION_SYSTEM_PROMPT},

            {

                "role": "user",

                "content": json.dumps(

                    {"graph_type": graph_type, **spec}

                ),

            },

        ],

        response_format={"type": "json_object"},
        temperature=0,
        max_tokens=JSON_MAX_TOKENS,

    )

    raw = json.loads(response.choices[0].message.content)

    return {

        "graph": raw.get("graph", {"nodes": [], "edges": [], "directed": False}),

        "frames": raw.get("frames", []),

    }





# ---------------------------------------------------------------------------

# Graph frame narrator â€” generates a short narration for a single graph frame

# ---------------------------------------------------------------------------

async def narrate_graph_frame(

    conversation: List[dict],

    graph: dict,

    all_frames: List[dict],

    index: int,

    total: int,

) -> str:

    """Narrate a single graph animation frame with full-animation context."""



    safe_conversation = ensure_string_content(conversation)

    messages = safe_conversation + [

        {

            "role": "user",

            "content": f"""\

You are a warm, supportive mentor narrating a visual graph algorithm step.

Respond with ONLY a JSON object: {{"narration": "..."}}.



Frame {index} of {total} total frames.



## PACING â€” this is critical for learning:



**Frames 0â€“2 (Teaching Phase):**

  Explain the mechanic deeply. Walk through the logic like the student has never seen it.

  - "We start at node A. In BFS, we use a queue â€” first in, first out. So we add A to our queue and mark it as visited."

  - "Now we dequeue A and look at its neighbors: B and C. We add both to the queue."

  - 3â€“4 sentences. Name the nodes, explain the data structure, explain WHY.



**Frames 3â€“5 (Reinforcement Phase):**

  The student now knows the rule. Narrate the action but skip re-explaining the full mechanic.

  - "Dequeue B, visit its neighbors D and E. Add them to the queue."

  - 1â€“2 sentences. Reference the established pattern.



**Frames 6+ (Rhythm Phase):**

  The student has internalized the pattern. Use very short cues.

  - "Visit D." / "Nothing new from E." / "Queue is empty â€” done!"

  - 1 sentence max, often just a few words.



## Rules:

- Reference specific NODE NAMES (A, B, C...) â€” not generic "the current node."

- Mention the frontier state (queue/stack contents) in early frames.

- Do NOT repeat what the on-screen label already says. Add insight, not echo.

- On the final frame, give a satisfying conclusion: "And that's our BFS complete â€” we visited every reachable node, layer by layer."



GRAPH STRUCTURE:

{json.dumps(graph)}



ALL FRAMES (for context):

{json.dumps(all_frames)}



NARRATE FRAME INDEX: {index}

"""

        }

    ]

    response = await get_openai_client().chat.completions.create(

        model=LLM_MODEL,

        messages=messages,

        response_format={"type": "json_object"},

        temperature=0.5,

    )

    raw = json.loads(response.choices[0].message.content)

    return raw.get("narration", all_frames[index].get("label", ""))





# ---------------------------------------------------------------------------

# Frame narrator â€” generates a short narration for a single animation frame

# ---------------------------------------------------------------------------

async def narrate_frame(

    conversation: List[dict],

    all_frames: List[dict],

    index: int,

    total: int,

) -> str:

    """Narrate a single frame with full-animation context.



    The LLM receives *every* frame so it understands what already happened,

    what is happening now, and what comes next.  This lets it produce

    context-aware narration like "We're almost done â€” the pointer just

    landed on our target" instead of a generic "The pointer moved."

    """

   

    safe_conversation = ensure_string_content(conversation)

    messages = safe_conversation + [

        {

            "role": "user",

            "content": f"""\

You are a warm, supportive mentor narrating a visual algorithm step.

Respond with ONLY a JSON object: {{"narration": "..."}}.



Frame {index} of {total} total frames.



## PACING â€” this is critical for learning:



**Frames 0â€“2 (Teaching Phase):**

  Explain the mechanic deeply. Walk through the logic like the student has never seen it.

  - "Look at where our pointers are. We're comparing the value at index 0, which is 5, with the value at index 1, which is 3. Since 5 is greater than 3, the rule says we need to swap them."

  - 3â€“4 sentences. Name the values, name the indices, explain WHY.



**Frames 3â€“5 (Reinforcement Phase):**

  The student now knows the rule. Narrate the action but skip re-explaining the full mechanic.

  - "Comparing these two â€” 8 is bigger, so swap."

  - 1â€“2 sentences. Reference the established pattern.



**Frames 6+ (Rhythm Phase):**

  The student has internalized the pattern. Use very short cues.

  - "Swap." / "No swap, move on." / "Already sorted." / "And done!"

  - 1 sentence max, often just a few words.



## Rules:

- Do NOT repeat what the on-screen label already says. Add insight, not echo.

- If the frame shows a swap ABOUT to happen, build anticipation: "These two are out of order â€” watch what happens."

- If the frame shows AFTER a swap, confirm it: "There we go, now that's in place."

- On the final frame, give a satisfying conclusion: "And we're done â€” the array is fully sorted."



ALL FRAMES (for context):

{all_frames}



NARRATE FRAME INDEX: {index}

"""

        }

    ]

    response = await get_openai_client().chat.completions.create(

        model=LLM_MODEL,

        messages=messages,

        response_format={"type": "json_object"},

        temperature=0.5,

    )

    raw = json.loads(response.choices[0].message.content)

    return raw.get("narration", all_frames[index].get("label", ""))





# ---------------------------------------------------------------------------

# Code segment narrator â€” narrates a single code segment

# ---------------------------------------------------------------------------

async def narrate_code_segment(

    conversation: List[dict],

    code: str,

    segments: List[dict],

    index: int,

    total: int,

) -> str:

    """Narrate a single code segment with full-code context.



    Uses the same 3-phase pacing strategy as narrate_frame:

    early segments get deep explanation, later ones are shorter.

    """

    safe_conversation = ensure_string_content(conversation)

    messages = safe_conversation + [

        {

            "role": "user",

            "content": f"""\

You are a warm, supportive mentor walking a student through code.

Respond with ONLY a JSON object: {{"narration": "..."}}.



Segment {index + 1} of {total} total segments.



## PACING â€” adapt depth based on position:



**Segments 1â€“2 (Teaching Phase):**

  Explain the code deeply. Walk through each line's purpose like the student is new to this.

  - Name specific variables, functions, and values.

  - Explain WHY this code exists, not just what it does.

  - 3â€“4 sentences.



**Segments 3â€“4 (Reinforcement Phase):**

  The student now has context. Explain the logic but skip re-explaining established patterns.

  - "Here we handle the edge caseâ€¦" / "This loop does the heavy liftingâ€¦"

  - 1â€“2 sentences.



**Segments 5+ (Rhythm Phase):**

  The student understands the structure. Be brief.

  - "Standard return." / "Clean-up and output." / "And that wraps it up."

  - 1 sentence max.



## Rules:

- Reference the ACTUAL code on the highlighted lines. Quote variable names and values.

- Do NOT just restate the segment explanation â€” add teaching insight.

- If this is the first segment, set the stage: "Let's start at the topâ€¦"

- If this is the last segment, give a satisfying wrap-up.



FULL CODE:

```

{code}

```



ALL SEGMENTS (for context):

{json.dumps(segments)}



NARRATE SEGMENT INDEX: {index} (lines {segments[index].get("lines", [])})

"""

        }

    ]

    response = await get_openai_client().chat.completions.create(

        model=LLM_MODEL,

        messages=messages,

        response_format={"type": "json_object"},

        temperature=0.5,

    )

    raw = json.loads(response.choices[0].message.content)

    return raw.get("narration", segments[index].get("explanation", ""))





# ---------------------------------------------------------------------------

# THE ORCHESTRATOR â€” multi-turn async generator

# ---------------------------------------------------------------------------

MAX_TURNS = 30  # safety cap to avoid infinite loops





async def orchestrate(user_query: Union[str, List[dict]]) -> AsyncIterator[str]:

    """Run the multi-turn orchestration loop, yielding SSE events."""



    if isinstance(user_query, list):
        safe_history = ensure_string_content(user_query)
        user_query.clear()
        user_query.extend(safe_history)
        messages = user_query
        if not messages or messages[0].get("role") != "system":
            messages.insert(0, {"role": "system", "content": ORCHESTRATOR_SYSTEM_PROMPT})
        else:
            messages[0]["content"] = ORCHESTRATOR_SYSTEM_PROMPT
    else:
        messages = [
            {"role": "system", "content": ORCHESTRATOR_SYSTEM_PROMPT},
            {"role": "user", "content": user_query},
        ]
    _trim_history_in_place(messages)

    event_seq = 0

    def _event(
        payload: Dict[str, Any],
        turn: int,
        ui_target: str,
        phase: str,
        group: Optional[str] = None,
        wait_for_ui_ms: Optional[int] = None,
        visual_component: Optional[str] = None,
    ) -> Dict[str, Any]:
        nonlocal event_seq
        event_seq += 1

        wrapped = dict(payload)
        wrapped["ui_target"] = ui_target
        if visual_component:
            wrapped["visual_component"] = visual_component

        sync: Dict[str, Any] = {
            "turn": turn,
            "seq": event_seq,
            "phase": phase,
        }
        if group:
            sync["group"] = group
        if wait_for_ui_ms is not None:
            sync["wait_for_ui_ms"] = wait_for_ui_ms

        wrapped["sync"] = sync
        return wrapped



    for _turn in range(MAX_TURNS):
        turn_idx = _turn + 1
        _trim_history_in_place(messages)

        # â”€â”€ Ask orchestrator: "What is your next action?" â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        action = _normalize_orchestrator_action(await get_next_action(messages))
        _append_history_message(messages, "assistant", action.model_dump_json())



        # â”€â”€ NARRATE (optionally with companion content card) â”€â”€â”€â”€â”€â”€â”€â”€

        if action.action == "NARRATE" and action.script:

            # If a companion content card is attached, emit it FIRST

            # so the frontend shows it while the audio streams.

            if action.content_title:
                yield sse(
                    _event(
                        {
                            "type": "content_card",
                            "title": action.content_title,
                            "body": action.content_body or "",
                        },
                        turn=turn_idx,
                        ui_target="CONCEPT",
                        phase="card",
                        group=f"turn-{turn_idx}-narrate",
                    )
                )



            # yield sse({"type": "audio_start", "text": action.script})
            # async for chunk in voice_stream(action.script):
            #     yield sse({"type": "audio_chunk", "data": b64(chunk)})
            # yield sse({"type": "audio_done"})
            yield sse(
                _event(
                    {"type": "speak", "text": action.script},
                    turn=turn_idx,
                    ui_target="CONCEPT",
                    phase="audio",
                    group=f"turn-{turn_idx}-narrate",
                    wait_for_ui_ms=120,
                )
            )
            _append_history_message(messages, "assistant", f"Spoken narration: {action.script}")



            card_note = ""

            if action.content_title:

                card_note = f" (content card '{action.content_title}' was shown alongside)"

            _append_history_message(
                messages,
                "user",
                f"Narration delivered to student{card_note}. What is your next action?",
            )



        # â”€â”€ SHOW_CONTENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        elif action.action == "SHOW_CONTENT" and action.content_title:
            yield sse(
                _event(
                    {
                        "type": "content_card",
                        "title": action.content_title,
                        "body": action.content_body or "",
                    },
                    turn=turn_idx,
                    ui_target="CONCEPT",
                    phase="card",
                    group=f"turn-{turn_idx}-content",
                )
            )



            _append_history_message(
                messages,
                "user",
                (
                    f"Content card '{action.content_title}' shown to student. "
                    "What is your next action?"
                ),
            )



        # â”€â”€ SHOW_VISUAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        elif action.action == "SHOW_VISUAL" and action.visual_type and action.visual_spec:

            visual = await generate_visual(action.visual_type, action.visual_spec)
            visual_component = "MERMAID" if action.visual_type == "MERMAID" else "BROWSER"
            yield sse(
                _event(
                    {
                        "type": "visual",
                        "visual_type": action.visual_type,
                        "payload": visual,
                    },
                    turn=turn_idx,
                    ui_target="VISUAL",
                    phase="visual",
                    group=f"turn-{turn_idx}-visual",
                    visual_component=visual_component,
                )
            )



            # Feed visual content back so next narration is context-aware

            _append_history_message(
                messages,
                "user",
                (
                    f"Visual generated and shown to student. Visual data: "
                    f"{json.dumps(visual)}. What is your next action?"
                ),
            )



        # â”€â”€ ANIMATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        elif action.action == "ANIMATE" and action.animation_type and action.animation_spec:

            animation_spec = dict(action.animation_spec)

            resolved_array, resolved_source = _resolve_animation_array(
                animation_spec, messages, action.animation_type
            )
            requires_multi_array = _requires_multi_element_array(
                action.animation_type, str(animation_spec.get("description", "") or "")
            )

            if resolved_array is not None:

                original_array = animation_spec.get("array")

                animation_spec["array"] = resolved_array

                if resolved_source:

                    logger.warning(

                        "[ANIMATE][ARRAY_FIX] source=%s before=%s after=%s",

                        resolved_source,

                        _safe_dump(original_array, 600),

                        _safe_dump(resolved_array, 600),

                    )

            # If the orchestrator already provided frames inline, use them.

            # Otherwise, call the animation worker to generate them.

            frames = animation_spec.get("frames")
            frame_source = "inline_spec"

            if not frames:

                frames = await generate_animation(

                    action.animation_type, animation_spec

                )
                frame_source = "llm_worker"

            animation_component = _infer_animation_component(
                action.animation_type, animation_spec
            )

            if animation_component == "ARRAY":
                fallback_array = (
                    resolved_array
                    if resolved_array and len(resolved_array) >= 1
                    else _coerce_numeric_array(animation_spec.get("array")) or []
                )
                frames = _sanitize_array_frames(
                    frames,
                    fallback_array=fallback_array,
                    requires_multi=requires_multi_array,
                )

            if resolved_array and len(resolved_array) >= 2 and isinstance(frames, list):

                patched = 0

                for frame in frames:

                    if not isinstance(frame, dict):

                        continue

                    frame_array = frame.get("array")

                    coerced_frame = _coerce_numeric_array(frame_array)
                    if frame_array is None or _looks_collapsed_singleton_array(frame_array) or (
                        requires_multi_array and coerced_frame is not None and len(coerced_frame) < 2
                    ):

                        frame["array"] = list(resolved_array)

                        patched += 1

                if patched:

                    logger.warning(

                        "[ANIMATE][FRAME_ARRAY_FIX] patched=%s replacement=%s",

                        patched,

                        _safe_dump(resolved_array, 600),

                    )



            total = len(frames)

            if animation_component == "ARRAY":
                narrations = []
                prev_frame_for_narration: Optional[dict] = None
                for i, frame in enumerate(frames):
                    narrations.append(
                        _deterministic_array_narration(
                            frame, i, total, prev_frame=prev_frame_for_narration
                        )
                    )
                    prev_frame_for_narration = frame
            else:
                # Generate narrations sequentially to avoid provider TPM bursts.
                narrations = []
                for i in range(total):
                    narrations.append(await narrate_frame(messages, frames, i, total))



            # Extract array & target from spec or first frame for the frontend

            array_data = animation_spec.get("array", [])

            target_data = animation_spec.get("target")

            if not array_data and frames:

                array_data = frames[0].get("array", [])

            logger.warning(

                "[ANIMATE][START] source=%s animation_type=%s total=%s start_array_type=%s start_array=%s",

                frame_source,

                action.animation_type,

                total,

                type(array_data).__name__ if array_data is not None else "None",

                _safe_dump(array_data, 600),

            )

            start_event: dict = {

                "type": "animation_start",

                "animation_type": action.animation_type,

                "total_frames": total,

                "array": array_data,

            }

            if target_data is not None:

                start_event["target"] = target_data

            yield sse(
                _event(
                    start_event,
                    turn=turn_idx,
                    ui_target="VISUAL",
                    phase="animation_start",
                    group=f"turn-{turn_idx}-animation",
                    visual_component=animation_component,
                )
            )



            for i, frame in enumerate(frames):

                logger.warning(

                    "[ANIMATE][FRAME] idx=%s array_type=%s array=%s",

                    i,

                    type(frame.get("array")).__name__ if isinstance(frame, dict) else type(frame).__name__,

                    _safe_dump(frame.get("array") if isinstance(frame, dict) else frame, 600),

                )

                # Send the frame to the frontend

                yield sse(
                    _event(
                        {
                            "type": "frame",
                            "index": i,
                            "total": total,
                            "payload": frame,
                        },
                        turn=turn_idx,
                        ui_target="VISUAL",
                        phase="frame",
                        group=f"turn-{turn_idx}-animation-frame-{i}",
                        visual_component=animation_component,
                    )
                )



                # Narration is already ready â€” just stream the audio

                # yield sse({"type": "audio_start", "text": narrations[i]})
                # async for chunk in voice_stream(narrations[i]):
                #     yield sse({"type": "audio_chunk", "data": b64(chunk)})
                # yield sse({"type": "audio_done"})
                yield sse(
                    _event(
                        {"type": "speak", "text": narrations[i]},
                        turn=turn_idx,
                        ui_target="VISUAL",
                        phase="audio",
                        group=f"turn-{turn_idx}-animation-frame-{i}",
                        wait_for_ui_ms=90,
                        visual_component=animation_component,
                    )
                )



            yield sse(
                _event(
                    {"type": "animation_done"},
                    turn=turn_idx,
                    ui_target="VISUAL",
                    phase="animation_done",
                    group=f"turn-{turn_idx}-animation",
                    visual_component=animation_component,
                )
            )
            _append_history_message(
                messages,
                "assistant",
                f"Spoken animation walkthrough: {_spoken_digest(narrations)}",
            )



            # Feed the full animation back into context

            _append_history_message(
                messages,
                "user",
                (
                    f"Animation complete ({total} frames shown and narrated). "
                    f"Frames: {json.dumps(frames)}. What is your next action?"
                ),
            )



        # â”€â”€ EXPLAIN_CODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        elif action.action == "EXPLAIN_CODE" and action.code_spec:

            language = action.code_language or "python"

            explanation = await generate_code_explanation(language, action.code_spec)



            code = explanation["code"]

            segments = explanation["segments"]

            title = explanation["title"]

            total_segments = len(segments)



            # Generate narrations sequentially to avoid provider TPM bursts.
            narrations: List[str] = []
            for i in range(total_segments):
                narrations.append(
                    await narrate_code_segment(messages, code, segments, i, total_segments)
                )



            # Emit code_explainer_start â€” frontend creates the code card

            yield sse(
                _event(
                    {
                        "type": "code_explainer_start",
                        "code": code,
                        "language": explanation["language"],
                        "total_segments": total_segments,
                        "title": title,
                    },
                    turn=turn_idx,
                    ui_target="CODE",
                    phase="code_start",
                    group=f"turn-{turn_idx}-code",
                )
            )



            # Walk through each segment: highlight lines, then stream audio

            for i, segment in enumerate(segments):

                yield sse(
                    _event(
                        {
                            "type": "code_segment",
                            "index": i,
                            "total": total_segments,
                            "lines": segment.get("lines", [1, 1]),
                            "explanation": segment.get("explanation", ""),
                        },
                        turn=turn_idx,
                        ui_target="CODE",
                        phase="code_segment",
                        group=f"turn-{turn_idx}-code-segment-{i}",
                    )
                )



                # yield sse({"type": "audio_start", "text": narrations[i]})
                # async for chunk in voice_stream(narrations[i]):
                #     yield sse({"type": "audio_chunk", "data": b64(chunk)})
                # yield sse({"type": "audio_done"})
                yield sse(
                    _event(
                        {"type": "speak", "text": narrations[i]},
                        turn=turn_idx,
                        ui_target="CODE",
                        phase="audio",
                        group=f"turn-{turn_idx}-code-segment-{i}",
                        wait_for_ui_ms=90,
                    )
                )



            yield sse(
                _event(
                    {"type": "code_explainer_done"},
                    turn=turn_idx,
                    ui_target="CODE",
                    phase="code_done",
                    group=f"turn-{turn_idx}-code",
                )
            )
            _append_history_message(
                messages,
                "assistant",
                f"Spoken code walkthrough: {_spoken_digest(narrations)}",
            )



            # Feed context back into conversation

            _append_history_message(
                messages,
                "user",
                (
                    f"Code explanation complete ({total_segments} segments walked through). "
                    f"Code: {code[:200]}... Segments: {json.dumps(segments)}. "
                    "What is your next action?"
                ),
            )



        # â”€â”€ GRAPH_ANIMATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        elif action.action == "GRAPH_ANIMATE" and action.graph_spec:

            graph_type = action.graph_type or "bfs"
            graph_component = _infer_graph_component(graph_type)

            result = await generate_graph_animation(graph_type, action.graph_spec)



            graph = result["graph"]

            frames = result["frames"]

            total = len(frames)



            # Generate narrations sequentially to avoid provider TPM bursts.
            narrations: List[str] = []
            for i in range(total):
                narrations.append(
                    await narrate_graph_frame(messages, graph, frames, i, total)
                )



            # Emit graph_start â€” frontend creates the graph card

            yield sse(
                _event(
                    {
                        "type": "graph_start",
                        "graph_type": graph_type,
                        "total_frames": total,
                        "graph": graph,
                    },
                    turn=turn_idx,
                    ui_target="VISUAL",
                    phase="graph_start",
                    group=f"turn-{turn_idx}-graph",
                    visual_component=graph_component,
                )
            )



            for i, frame in enumerate(frames):

                # Send the frame to the frontend

                yield sse(
                    _event(
                        {
                            "type": "graph_frame",
                            "index": i,
                            "total": total,
                            "payload": frame,
                        },
                        turn=turn_idx,
                        ui_target="VISUAL",
                        phase="graph_frame",
                        group=f"turn-{turn_idx}-graph-frame-{i}",
                        visual_component=graph_component,
                    )
                )



                # Narration is already ready â€” just stream the audio

                # yield sse({"type": "audio_start", "text": narrations[i]})
                # async for chunk in voice_stream(narrations[i]):
                #     yield sse({"type": "audio_chunk", "data": b64(chunk)})
                # yield sse({"type": "audio_done"})
                yield sse(
                    _event(
                        {"type": "speak", "text": narrations[i]},
                        turn=turn_idx,
                        ui_target="VISUAL",
                        phase="audio",
                        group=f"turn-{turn_idx}-graph-frame-{i}",
                        wait_for_ui_ms=90,
                        visual_component=graph_component,
                    )
                )



            yield sse(
                _event(
                    {"type": "graph_done"},
                    turn=turn_idx,
                    ui_target="VISUAL",
                    phase="graph_done",
                    group=f"turn-{turn_idx}-graph",
                    visual_component=graph_component,
                )
            )
            _append_history_message(
                messages,
                "assistant",
                f"Spoken graph walkthrough: {_spoken_digest(narrations)}",
            )



            # Feed the full animation back into context

            _append_history_message(
                messages,
                "user",
                (
                    f"Graph animation complete ({total} frames shown and narrated). "
                    f"Graph type: {graph_type}. Frames: {json.dumps(frames)}. "
                    "What is your next action?"
                ),
            )



        # â”€â”€ CHECKPOINT (The Pause) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        if action.action == "CHECKPOINT":

            # 1. Stream the audio for the question first

            if action.script:

                # yield sse({"type": "audio_start", "text": action.script})
                # async for chunk in voice_stream(action.script):
                #     yield sse({"type": "audio_chunk", "data": b64(chunk)})
                # yield sse({"type": "audio_done"})
                yield sse(
                    _event(
                        {"type": "speak", "text": action.script},
                        turn=turn_idx,
                        ui_target="CONCEPT",
                        phase="audio",
                        group=f"turn-{turn_idx}-checkpoint",
                        wait_for_ui_ms=60,
                    )
                )
                _append_history_message(messages, "assistant", f"Spoken checkpoint: {action.script}")



            # 2. Send the UI data for the buttons

            yield sse(
                _event(
                    {
                        "type": "checkpoint",
                        "title": action.checkpoint_title,
                        "options": [opt.model_dump() for opt in action.checkpoint_options or []],
                        "history": messages,  # Send the history back so the frontend can store it
                    },
                    turn=turn_idx,
                    ui_target="CONCEPT",
                    phase="checkpoint",
                    group=f"turn-{turn_idx}-checkpoint",
                )
            )

           

            # 3. CRITICAL: Stop the generator here.

            # The server's job is done until the user clicks a button.

            return



        # â”€â”€ DONE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        elif action.action == "DONE":
            yield sse(
                _event(
                    {"type": "done"},
                    turn=turn_idx,
                    ui_target="CONCEPT",
                    phase="done",
                    group=f"turn-{turn_idx}-done",
                )
            )

            break



        else:

            # Unknown or malformed action â€” ask again

            _append_history_message(
                messages,
                "user",
                "That action was not understood. Please respond with a valid action.",
            )



    else:

        # Exhausted MAX_TURNS â€” force end

        yield sse(
            _event(
                {"type": "done"},
                turn=MAX_TURNS,
                ui_target="CONCEPT",
                phase="done",
                group="max-turns",
            )
        )





# ---------------------------------------------------------------------------

# Endpoints

# ---------------------------------------------------------------------------

@app.get("/")

async def root():

    return {"message": "Hello from Outlrn Fast API!"}





@app.get("/health")

async def health_check():

    return {"status": "healthy"}





@app.post("/api/chat")

async def chat_endpoint(request: Request):

    data = await request.json()

    session_id = str(data.get("session_id") or "").strip()
    incoming_messages = data.get("messages", [])
    user_query = str(data.get("message", "") or "").strip()

    if session_id:
        history = SESSION_MEMORY.setdefault(
            session_id,
            [{"role": "system", "content": ORCHESTRATOR_SYSTEM_PROMPT}],
        )

        # Optional client hydration if explicit history is sent.
        if isinstance(incoming_messages, list) and incoming_messages:
            hydrated = [
                m
                for m in incoming_messages
                if m.get("content")
                and m.get("content") not in ("Setting up your lesson…", "Setting up your lesson...")
            ]
            if hydrated:
                history.clear()
                history.extend(ensure_string_content(hydrated))

        if not history or history[0].get("role") != "system":
            history.insert(0, {"role": "system", "content": ORCHESTRATOR_SYSTEM_PROMPT})
        else:
            history[0]["content"] = ORCHESTRATOR_SYSTEM_PROMPT

        if user_query:
            history.append({"role": "user", "content": user_query})

        _trim_history_in_place(history)

        return StreamingResponse(
            orchestrate(history), media_type="text/event-stream"
        )

    # Stateless fallback when session_id is missing.
    messages = incoming_messages if isinstance(incoming_messages, list) else []
    messages = [
        m
        for m in messages
        if m.get("content")
        and m.get("content") not in ("Setting up your lesson…", "Setting up your lesson...")
    ]

    if not messages:
        messages = [
            {"role": "system", "content": ORCHESTRATOR_SYSTEM_PROMPT},
            {"role": "user", "content": user_query},
        ]
    elif messages[0].get("role") != "system":
        messages.insert(0, {"role": "system", "content": ORCHESTRATOR_SYSTEM_PROMPT})
    else:
        messages[0]["content"] = ORCHESTRATOR_SYSTEM_PROMPT

    return StreamingResponse(
        orchestrate(messages), media_type="text/event-stream"
    )
