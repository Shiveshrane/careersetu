# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Outlrn is an AI-powered educational orchestration system. A user submits a topic, and the backend runs a multi-turn LLM loop that produces a structured lesson as a stream of Server-Sent Events (SSE). The frontend renders these events on an interactive infinite canvas with synchronized audio narration, content cards, algorithm animations, and diagrams.

## Commands

```bash
# Install dependencies
uv sync

# Run development server (hot-reload on port 8000)
uv run fastapi dev main.py

# Run production server
uv run fastapi run main.py
```

API docs available at `/docs` (Swagger) and `/redoc` when server is running.

## Environment

Requires `.env` with `OPENAI_API_KEY` (needs access to `gpt-5.1` and `gpt-4o-mini-tts`).

Python 3.10+ managed via UV. Frontend (canvas-ui.tsx, frontend-page.tsx) is Next.js/React/TypeScript and expects Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

## Architecture

### Backend (`main.py`)

Single-file FastAPI server. The core is the `orchestrate(user_query)` async generator which runs a multi-turn loop (max 30 turns) against GPT-5.1 in JSON mode. Each turn returns an `OrchestratorAction` (Pydantic model) with one of 5 action types:

| Action | What it does | SSE events emitted |
|---|---|---|
| `NARRATE` | TTS audio stream + optional content card | `audio_start`, `audio_chunk`, `audio_done`, optionally `content_card` |
| `SHOW_CONTENT` | Display markdown content card | `content_card` |
| `SHOW_VISUAL` | Generate Mermaid diagram or HTML/CSS UI sandbox | `visual` |
| `ANIMATE` | Algorithm visualization with frame-by-frame narration | `animation_start`, `frame` (×N), `animation_done` |
| `DONE` | End lesson | `done` |

**Worker functions** handle sub-tasks: `voice_stream()` streams TTS audio in 4KB chunks, `mermaid_worker()` and `browser_ui_worker()` generate visuals via LLM, `generate_animation()` creates frame sequences, and `narrate_frame()` provides per-frame audio with a 3-phase pacing strategy (Teaching → Reinforcement → Rhythm).

Frame narrations are pre-generated in parallel via `asyncio.gather()` for latency optimization.

The orchestrator personality follows specific pedagogy: depth-first teaching (Analogy → First Principles → Contrast → Scaffolding) with dual-coding (every narration paired with a visual).

### Frontend

Two React/TypeScript components exist:

- **`canvas-ui.tsx`** — Primary UI. Infinite pan/zoom canvas with dotted grid, card elements (theory, animation, code), animated arrows between cards, focus mode, session persistence in localStorage, and auto-hiding controls. Consumes the SSE stream and synchronizes audio playback with card rendering.

- **`frontend-page.tsx`** — Simpler timeline-based list view consuming the same SSE stream. Useful for testing or as a mobile fallback.

### Data Flow

```
User input → POST /api/chat → orchestrate() loop →
  GPT-5.1 decides action → worker generates content →
  SSE stream → Frontend parses events sequentially →
  Creates canvas elements, plays audio, animates camera
```

### Animation Frame Format

Each animation frame requires: `array` (current state), `pointers` (label→index map), `highlights` (indices being compared), `activeRange` (search space tuple), `label` (1-sentence explanation).

## Key Design Decisions

- **SSE streaming** holds the HTTP connection open; no request/response cycle per action.
- **CORS allows all origins** (`allow_origins=["*"]`).
- **Three separate system prompts** specialize the LLM for orchestration, Mermaid generation, and browser UI generation. A fourth prompt handles animation generation.
- The `workers/` directory exists but is empty — intended for future modularization of worker functions out of `main.py`.
