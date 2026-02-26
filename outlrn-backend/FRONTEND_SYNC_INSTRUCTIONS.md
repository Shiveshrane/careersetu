# Frontend Sync Contract (Orchestrator v2)

The backend now emits deterministic routing and sync metadata on every SSE event.

## 1) Required Event Fields

- `ui_target`: `"CONCEPT" | "CODE" | "VISUAL"`
- `sync`: object with:
  - `turn`: orchestrator turn number
  - `seq`: global event sequence
  - `phase`: event phase (`card`, `audio`, `frame`, `code_segment`, etc.)
  - `group` (optional): ties visual/code/card events to their matching `speak`
  - `wait_for_ui_ms` (optional): delay before audio starts so UI paints first
- `visual_component` (visual events only): `"ARRAY" | "TREE" | "NETWORK" | "MERMAID" | "BROWSER"`

## 2) Frontend Routing Rules

- Switch tabs from `ui_target`:
  - `CONCEPT` -> concept tab
  - `CODE` -> code tab
  - `VISUAL` -> visual tab
- If `sync.wait_for_ui_ms` exists on `speak`, queue a short wait before playback.
- For visual rendering:
  - `visual_component = ARRAY` -> array visualizer
  - `visual_component = TREE` -> tree visualizer
  - `visual_component = NETWORK` -> graph/network component
  - `MERMAID` / `BROWSER` -> existing visual handlers

## 3) Tree + Array Usage

- Array algorithm animations come from `ANIMATE` (`frame` payloads with array pointers/highlights).
- Tree/BST/AVL/traversal visualizations come from `GRAPH_ANIMATE` and can be rendered as `TREE`.

## 4) Sync Behavior

- Display events are emitted before `speak` in the same `sync.group`.
- Frontend should render card/frame/highlight first, then start audio for that same group.
- Keep queue processing strictly sequential to preserve lockstep narration and visuals.
