import asyncio

import base64

import json

import logging

import os

from typing import Any, AsyncIterator, Dict, List, Literal, Optional, Union



from dotenv import load_dotenv



load_dotenv()

logger = logging.getLogger("outlrn")



from fastapi import FastAPI, Request

from fastapi.middleware.cors import CORSMiddleware

from fastapi.responses import StreamingResponse

from openai import AsyncOpenAI

from pydantic import BaseModel, field_validator



# ---------------------------------------------------------------------------

# App & Client

# ---------------------------------------------------------------------------

app = FastAPI(

    title="Outlrn Fast API",

    description="Outlrn FastAPI application — audio-driven orchestration",

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





def get_openai_client() -> AsyncOpenAI:

    global _client

    if _client is None:

        _client = AsyncOpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

    return _client





# ---------------------------------------------------------------------------

# Pydantic Models — action-based orchestrator contract

# ---------------------------------------------------------------------------



class CheckpointOption(BaseModel):

    label: str    # What the button says (e.g., "Yes, continue")

    value: str    # The hidden message sent back to the LLM (e.g., "proceed")



class OrchestratorAction(BaseModel):

    """One action emitted per orchestrator turn."""



    action: Literal["NARRATE", "SHOW_CONTENT", "SHOW_VISUAL", "ANIMATE", "EXPLAIN_CODE", "CHECKPOINT", "GRAPH_ANIMATE", "DONE"]



    # NARRATE — text the voice agent will speak

    script: Optional[str] = None



    # SHOW_CONTENT — brief content card

    content_title: Optional[str] = None

    content_body: Optional[Union[str, List[str]]] = None



    # SHOW_VISUAL — static visual (diagram / sandbox)

    visual_type: Optional[Literal["MERMAID", "BROWSER"]] = None

    visual_spec: Optional[str] = None



    # ANIMATE — step-by-step frame animation

    animation_type: Optional[str] = None  # e.g. "array_walk", "tree_traverse"

    animation_spec: Optional[Dict[str, Any]] = None  # config for the anim worker



    checkpoint_title: Optional[str] = None

    checkpoint_options: Optional[List[CheckpointOption]] = None



    # EXPLAIN_CODE — walk through code with synced line highlights

    code_language: Optional[str] = None       # e.g. "python", "javascript"

    code_spec: Optional[Dict[str, Any]] = None  # {description: "...", code: "..." (optional)}



    # GRAPH_ANIMATE — graph theory visualization

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

ALL values in the JSON must be STRINGS (except for animation_spec and checkpoint_options).

Do NOT use arrays/lists for content_body; use a single string with \\n for newlines.



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

- **ANIMATE:** Step-by-step array/list logic. {"action":"ANIMATE","animation_type":"array","animation_spec":{"array":[...],"description":"..."}}

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



# ---------------------------------------------------------------------------

# get_next_action — ask the orchestrator LLM for its next move

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

                temperature=0.5,

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

# WORKER — Voice (streaming TTS)

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

# WORKER — Mermaid diagram

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

    )

    return json.loads(response.choices[0].message.content)





# ---------------------------------------------------------------------------

# WORKER — Browser UI sandbox

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

    )

    return json.loads(response.choices[0].message.content)





# ---------------------------------------------------------------------------

# DISPATCHER — routes to the right visual worker

# ---------------------------------------------------------------------------

async def generate_visual(visual_type: str, spec: str) -> dict:

    if visual_type == "MERMAID":

        return await mermaid_worker(spec)

    elif visual_type == "BROWSER":

        return await browser_ui_worker(spec)

    raise ValueError(f"Unknown visual_type: {visual_type}")





# ---------------------------------------------------------------------------

# WORKER — Animation frame generator

# ---------------------------------------------------------------------------

ANIMATION_SYSTEM_PROMPT = """\

You are a Visual Learning Designer. You create step-by-step frames for algorithm visualizations.

Goal: Every frame must represent a "Decision Point" in the algorithm.



IMPORTANT: Respond ONLY with a valid JSON object containing a "frames" array.



## MANDATORY FRAME FIELDS — every frame MUST include ALL of these:

{

  "array":       [<current state of the array — update after swaps/moves>],

  "pointers":    {"<LabelName>": <index>, ...},

  "highlights":  [<indices being compared or acted on>],

  "activeRange": [<start>, <end>] | null,

  "label":       "<1-sentence explanation of the LOGIC of this step>"

}



## POINTERS ARE REQUIRED — never omit them.

`pointers` is an object mapping label names to array indices.

Use descriptive labels that match the algorithm:



  Binary search → {"L": 0, "M": 4, "R": 9}

  Bubble sort   → {"i": 0, "j": 1}

  Quick sort    → {"pivot": 5, "i": 1, "j": 7}

  Two pointers  → {"left": 0, "right": 9}

  Insertion sort→ {"key": 3, "j": 2}

  Selection sort→ {"min": 2, "i": 4}

  Linear search → {"i": 3}

  Merge sort    → {"l": 0, "m": 3, "r": 7}



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



## Concrete Example — Bubble Sort of [5, 3, 8, 1]:



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

2. Break the code into logical segments — each segment is a contiguous range of lines that forms one conceptual unit.



## Output Format

{

  "code": "<the full source code>",

  "language": "python",

  "title": "Short title for the code card",

  "segments": [

    {"lines": [1, 3], "explanation": "Import statements and setup — we bring in the tools we need."},

    {"lines": [5, 12], "explanation": "The main function definition — this is where the core logic lives."},

    ...

  ]

}



## Rules

- `lines` uses 1-based inclusive line numbers: [startLine, endLine].

- Every line of code must belong to at least one segment. No gaps.

- Segments should NOT overlap.

- Each segment should cover 2–8 lines. Split large blocks; merge trivial one-liners with neighbors.

- `explanation` should be a 1–2 sentence description of WHAT this segment does and WHY, written for a learner.

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

    )

    raw = json.loads(response.choices[0].message.content)

    return raw.get("frames", [])





# ---------------------------------------------------------------------------

# WORKER — Code explanation generator

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

    )

    raw = json.loads(response.choices[0].message.content)

    return {

        "code": raw.get("code", ""),

        "language": raw.get("language", code_language),

        "title": raw.get("title", "Code"),

        "segments": raw.get("segments", []),

    }





# ---------------------------------------------------------------------------

# WORKER — Graph animation frame generator

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

- `nodes`: Array of {id, label, x, y}. Positions are in a 400×300 normalized viewport.

  - x ranges from 20 to 380, y ranges from 20 to 280.

  - Space nodes so labels don't overlap. Trees: root at top center, layers below.

  - General graphs: spread nodes in a visually clear layout.

- `edges`: Array of {from, to} referencing node IDs.

- `directed`: true for directed graphs, false for undirected.

- Node positions are defined ONCE in the graph object and stay fixed across all frames.



## FRAME FIELDS — every frame MUST include ALL of these:

{

  "visitedNodes": ["A", "B"],         // IDs of all nodes visited so far

  "activeNode": "C",                   // The node currently being processed (or null)

  "visitedEdges": [["A","B"]],         // Edges already traversed (as [from, to] pairs)

  "activeEdge": ["B", "C"],            // The edge currently being traversed (or null)

  "frontier": ["D", "E"],              // Current queue/stack/priority queue contents

  "label": "Dequeue B. Visit neighbor C, add it to the queue."

}



## Pedagogy Rules:

1. **The "Start" Frame:** First frame shows the starting node highlighted, frontier initialized. Label explains the initial state.

2. **Show the Decision:** Before visiting a node, show it as the activeNode and explain why it's being selected (e.g., "It's at the front of the queue").

3. **Show the Traversal:** When moving along an edge, highlight it as activeEdge. Label explains the traversal.

4. **Update Frontier:** Each frame must accurately show the current frontier (queue for BFS, stack for DFS, priority queue for Dijkstra).

5. **Cumulative Progress:** visitedNodes and visitedEdges grow monotonically. Never remove a visited node/edge.

6. **Final Frame:** All reachable nodes are visited, frontier is empty. Label: "All nodes visited! Traversal complete."



## Graph Design Tips:

- For BFS/DFS demos: Use 6–10 nodes. Create a graph with enough branching to make the algorithm interesting.

- For tree traversals: Use a balanced or slightly unbalanced tree with 7–15 nodes.

- For Dijkstra: Add "weight" field to edges, use 5–8 nodes.

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

    )

    raw = json.loads(response.choices[0].message.content)

    return {

        "graph": raw.get("graph", {"nodes": [], "edges": [], "directed": False}),

        "frames": raw.get("frames", []),

    }





# ---------------------------------------------------------------------------

# Graph frame narrator — generates a short narration for a single graph frame

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



## PACING — this is critical for learning:



**Frames 0–2 (Teaching Phase):**

  Explain the mechanic deeply. Walk through the logic like the student has never seen it.

  - "We start at node A. In BFS, we use a queue — first in, first out. So we add A to our queue and mark it as visited."

  - "Now we dequeue A and look at its neighbors: B and C. We add both to the queue."

  - 3–4 sentences. Name the nodes, explain the data structure, explain WHY.



**Frames 3–5 (Reinforcement Phase):**

  The student now knows the rule. Narrate the action but skip re-explaining the full mechanic.

  - "Dequeue B, visit its neighbors D and E. Add them to the queue."

  - 1–2 sentences. Reference the established pattern.



**Frames 6+ (Rhythm Phase):**

  The student has internalized the pattern. Use very short cues.

  - "Visit D." / "Nothing new from E." / "Queue is empty — done!"

  - 1 sentence max, often just a few words.



## Rules:

- Reference specific NODE NAMES (A, B, C...) — not generic "the current node."

- Mention the frontier state (queue/stack contents) in early frames.

- Do NOT repeat what the on-screen label already says. Add insight, not echo.

- On the final frame, give a satisfying conclusion: "And that's our BFS complete — we visited every reachable node, layer by layer."



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

# Frame narrator — generates a short narration for a single animation frame

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

    context-aware narration like "We're almost done — the pointer just

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



## PACING — this is critical for learning:



**Frames 0–2 (Teaching Phase):**

  Explain the mechanic deeply. Walk through the logic like the student has never seen it.

  - "Look at where our pointers are. We're comparing the value at index 0, which is 5, with the value at index 1, which is 3. Since 5 is greater than 3, the rule says we need to swap them."

  - 3–4 sentences. Name the values, name the indices, explain WHY.



**Frames 3–5 (Reinforcement Phase):**

  The student now knows the rule. Narrate the action but skip re-explaining the full mechanic.

  - "Comparing these two — 8 is bigger, so swap."

  - 1–2 sentences. Reference the established pattern.



**Frames 6+ (Rhythm Phase):**

  The student has internalized the pattern. Use very short cues.

  - "Swap." / "No swap, move on." / "Already sorted." / "And done!"

  - 1 sentence max, often just a few words.



## Rules:

- Do NOT repeat what the on-screen label already says. Add insight, not echo.

- If the frame shows a swap ABOUT to happen, build anticipation: "These two are out of order — watch what happens."

- If the frame shows AFTER a swap, confirm it: "There we go, now that's in place."

- On the final frame, give a satisfying conclusion: "And we're done — the array is fully sorted."



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

# Code segment narrator — narrates a single code segment

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



## PACING — adapt depth based on position:



**Segments 1–2 (Teaching Phase):**

  Explain the code deeply. Walk through each line's purpose like the student is new to this.

  - Name specific variables, functions, and values.

  - Explain WHY this code exists, not just what it does.

  - 3–4 sentences.



**Segments 3–4 (Reinforcement Phase):**

  The student now has context. Explain the logic but skip re-explaining established patterns.

  - "Here we handle the edge case…" / "This loop does the heavy lifting…"

  - 1–2 sentences.



**Segments 5+ (Rhythm Phase):**

  The student understands the structure. Be brief.

  - "Standard return." / "Clean-up and output." / "And that wraps it up."

  - 1 sentence max.



## Rules:

- Reference the ACTUAL code on the highlighted lines. Quote variable names and values.

- Do NOT just restate the segment explanation — add teaching insight.

- If this is the first segment, set the stage: "Let's start at the top…"

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

# THE ORCHESTRATOR — multi-turn async generator

# ---------------------------------------------------------------------------

MAX_TURNS = 30  # safety cap to avoid infinite loops





async def orchestrate(user_query: str) -> AsyncIterator[str]:

    """Run the multi-turn orchestration loop, yielding SSE events."""



    messages: List[dict] = [

        {"role": "system", "content": ORCHESTRATOR_SYSTEM_PROMPT},

        {"role": "user", "content": user_query},

    ]



    for _turn in range(MAX_TURNS):

        # ── Ask orchestrator: "What is your next action?" ────────────

        action = await get_next_action(messages)

        messages.append({"role": "assistant", "content": action.model_dump_json()})



        # ── NARRATE (optionally with companion content card) ────────

        if action.action == "NARRATE" and action.script:

            # If a companion content card is attached, emit it FIRST

            # so the frontend shows it while the audio streams.

            if action.content_title:

                yield sse({

                    "type": "content_card",

                    "title": action.content_title,

                    "body": action.content_body or "",

                })



            # yield sse({"type": "audio_start", "text": action.script})
            # async for chunk in voice_stream(action.script):
            #     yield sse({"type": "audio_chunk", "data": b64(chunk)})
            # yield sse({"type": "audio_done"})
            yield sse({"type": "speak", "text": action.script})



            card_note = ""

            if action.content_title:

                card_note = f" (content card '{action.content_title}' was shown alongside)"

            messages.append(

                {"role": "user", "content": f"Narration delivered to student{card_note}. What is your next action?"}

            )



        # ── SHOW_CONTENT ─────────────────────────────────────────────

        elif action.action == "SHOW_CONTENT" and action.content_title:

            yield sse({

                "type": "content_card",

                "title": action.content_title,

                "body": action.content_body or "",

            })



            messages.append({

                "role": "user",

                "content": (

                    f"Content card '{action.content_title}' shown to student. "

                    "What is your next action?"

                ),

            })



        # ── SHOW_VISUAL ──────────────────────────────────────────────

        elif action.action == "SHOW_VISUAL" and action.visual_type and action.visual_spec:

            visual = await generate_visual(action.visual_type, action.visual_spec)

            yield sse({

                "type": "visual",

                "visual_type": action.visual_type,

                "payload": visual,

            })



            # Feed visual content back so next narration is context-aware

            messages.append({

                "role": "user",

                "content": (

                    f"Visual generated and shown to student. Visual data: "

                    f"{json.dumps(visual)}. What is your next action?"

                ),

            })



        # ── ANIMATE ──────────────────────────────────────────────────

        elif action.action == "ANIMATE" and action.animation_type and action.animation_spec:

            # If the orchestrator already provided frames inline, use them.

            # Otherwise, call the animation worker to generate them.

            frames = action.animation_spec.get("frames")

            if not frames:

                frames = await generate_animation(

                    action.animation_type, action.animation_spec

                )



            total = len(frames)



            # Pre-generate ALL narrations in parallel before the loop.

            # Since narrate_frame already has the full frames list for

            # context, every call is independent — perfect for gather.

            # This turns N sequential LLM round-trips into 1 parallel batch.

            narrations: List[str] = await asyncio.gather(

                *(narrate_frame(messages, frames, i, total) for i in range(total))

            )



            # Extract array & target from spec or first frame for the frontend

            array_data = action.animation_spec.get("array", [])

            target_data = action.animation_spec.get("target")

            if not array_data and frames:

                array_data = frames[0].get("array", [])



            start_event: dict = {

                "type": "animation_start",

                "animation_type": action.animation_type,

                "total_frames": total,

                "array": array_data,

            }

            if target_data is not None:

                start_event["target"] = target_data

            yield sse(start_event)



            for i, frame in enumerate(frames):

                # Send the frame to the frontend

                yield sse({

                    "type": "frame",

                    "index": i,

                    "total": total,

                    "payload": frame,

                })



                # Narration is already ready — just stream the audio

                # yield sse({"type": "audio_start", "text": narrations[i]})
                # async for chunk in voice_stream(narrations[i]):
                #     yield sse({"type": "audio_chunk", "data": b64(chunk)})
                # yield sse({"type": "audio_done"})
                yield sse({"type": "speak", "text": narrations[i]})



            yield sse({"type": "animation_done"})



            # Feed the full animation back into context

            messages.append({

                "role": "user",

                "content": (

                    f"Animation complete ({total} frames shown and narrated). "

                    f"Frames: {json.dumps(frames)}. What is your next action?"

                ),

            })



        # ── EXPLAIN_CODE ──────────────────────────────────────────────

        elif action.action == "EXPLAIN_CODE" and action.code_spec:

            language = action.code_language or "python"

            explanation = await generate_code_explanation(language, action.code_spec)



            code = explanation["code"]

            segments = explanation["segments"]

            title = explanation["title"]

            total_segments = len(segments)



            # Pre-generate ALL segment narrations in parallel (same pattern as animation frames)

            narrations: List[str] = await asyncio.gather(

                *(

                    narrate_code_segment(messages, code, segments, i, total_segments)

                    for i in range(total_segments)

                )

            )



            # Emit code_explainer_start — frontend creates the code card

            yield sse({

                "type": "code_explainer_start",

                "code": code,

                "language": explanation["language"],

                "total_segments": total_segments,

                "title": title,

            })



            # Walk through each segment: highlight lines, then stream audio

            for i, segment in enumerate(segments):

                yield sse({

                    "type": "code_segment",

                    "index": i,

                    "total": total_segments,

                    "lines": segment.get("lines", [1, 1]),

                    "explanation": segment.get("explanation", ""),

                })



                # yield sse({"type": "audio_start", "text": narrations[i]})
                # async for chunk in voice_stream(narrations[i]):
                #     yield sse({"type": "audio_chunk", "data": b64(chunk)})
                # yield sse({"type": "audio_done"})
                yield sse({"type": "speak", "text": narrations[i]})



            yield sse({"type": "code_explainer_done"})



            # Feed context back into conversation

            messages.append({

                "role": "user",

                "content": (

                    f"Code explanation complete ({total_segments} segments walked through). "

                    f"Code: {code[:200]}... Segments: {json.dumps(segments)}. "

                    "What is your next action?"

                ),

            })



        # ── GRAPH_ANIMATE ────────────────────────────────────────────

        elif action.action == "GRAPH_ANIMATE" and action.graph_spec:

            graph_type = action.graph_type or "bfs"

            result = await generate_graph_animation(graph_type, action.graph_spec)



            graph = result["graph"]

            frames = result["frames"]

            total = len(frames)



            # Pre-generate ALL narrations in parallel

            narrations: List[str] = await asyncio.gather(

                *(

                    narrate_graph_frame(messages, graph, frames, i, total)

                    for i in range(total)

                )

            )



            # Emit graph_start — frontend creates the graph card

            yield sse({

                "type": "graph_start",

                "graph_type": graph_type,

                "total_frames": total,

                "graph": graph,

            })



            for i, frame in enumerate(frames):

                # Send the frame to the frontend

                yield sse({

                    "type": "graph_frame",

                    "index": i,

                    "total": total,

                    "payload": frame,

                })



                # Narration is already ready — just stream the audio

                # yield sse({"type": "audio_start", "text": narrations[i]})
                # async for chunk in voice_stream(narrations[i]):
                #     yield sse({"type": "audio_chunk", "data": b64(chunk)})
                # yield sse({"type": "audio_done"})
                yield sse({"type": "speak", "text": narrations[i]})



            yield sse({"type": "graph_done"})



            # Feed the full animation back into context

            messages.append({

                "role": "user",

                "content": (

                    f"Graph animation complete ({total} frames shown and narrated). "

                    f"Graph type: {graph_type}. Frames: {json.dumps(frames)}. "

                    "What is your next action?"

                ),

            })



        # ── CHECKPOINT (The Pause) ──────────────────────────────────

        if action.action == "CHECKPOINT":

            # 1. Stream the audio for the question first

            if action.script:

                # yield sse({"type": "audio_start", "text": action.script})
                # async for chunk in voice_stream(action.script):
                #     yield sse({"type": "audio_chunk", "data": b64(chunk)})
                # yield sse({"type": "audio_done"})
                yield sse({"type": "speak", "text": action.script})



            # 2. Send the UI data for the buttons

            yield sse({

                "type": "checkpoint",

                "title": action.checkpoint_title,

                "options": [opt.model_dump() for opt in action.checkpoint_options or []],

                "history": messages # Send the history back so the frontend can store it

            })

           

            # 3. CRITICAL: Stop the generator here.

            # The server's job is done until the user clicks a button.

            return



        # ── DONE ─────────────────────────────────────────────────────

        elif action.action == "DONE":

            yield sse({"type": "done"})

            break



        else:

            # Unknown or malformed action — ask again

            messages.append({

                "role": "user",

                "content": "That action was not understood. Please respond with a valid action.",

            })



    else:

        # Exhausted MAX_TURNS — force end

        yield sse({"type": "done"})





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

    messages = data.get("messages", [])

   

    # Filter out UI-only messages like "Setting up your lesson..."

    # and ensure content isn't empty

    messages = [

        m for m in messages

        if m.get("content") and m["content"] != "Setting up your lesson…"

    ]



    if not messages:

        user_query = data.get("message", "")

        messages = [

            {"role": "system", "content": ORCHESTRATOR_SYSTEM_PROMPT},

            {"role": "user", "content": str(user_query)}

        ]

   

    # Ensure system prompt is exactly once at the top

    if not messages or messages[0].get("role") != "system":

        messages.insert(0, {"role": "system", "content": ORCHESTRATOR_SYSTEM_PROMPT})

    else:

        # Update the system prompt in case you've tweaked it since the session started

        messages[0]["content"] = ORCHESTRATOR_SYSTEM_PROMPT



    return StreamingResponse(

        orchestrate(messages), media_type="text/event-stream"

    )