"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types — mirror the SSE events from the backend
// ---------------------------------------------------------------------------
type SSEEvent =
  | { type: "audio_start"; text: string }
  | { type: "audio_chunk"; data: string }
  | { type: "audio_done" }
  | { type: "visual"; visual_type: "MERMAID" | "BROWSER"; payload: Record<string, string> }
  | { type: "animation_start"; animation_type: string; total_frames: number }
  | { type: "frame"; index: number; total: number; payload: Record<string, any> }
  | { type: "animation_done" }
  | { type: "done" };

// What the user sees on screen — accumulated from events
interface TimelineEntry {
  kind: "narration" | "visual" | "frame";
  text?: string;
  audioBlob?: Blob;
  visual_type?: "MERMAID" | "BROWSER";
  payload?: Record<string, any>;
  animation_type?: string;
  frameIndex?: number;
  totalFrames?: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Array renderer — highlights low / high / mid
// ---------------------------------------------------------------------------
function ArrayWalkRenderer({ payload }: { payload: Record<string, any> }) {
  const arr: any[] = payload.array ?? payload.elements ?? [];
  const h = payload.highlights ?? {};
  const label: string = payload.label ?? "";

  return (
    <div>
      {label && <p className="mb-2 text-xs text-zinc-400">{label}</p>}
      <div className="flex flex-wrap gap-1">
        {arr.map((val: any, i: number) => {
          let ring = "";
          if (i === h.mid) ring = "ring-2 ring-amber-400 bg-amber-400/20 text-amber-200";
          else if (i === h.low || i === h.high) ring = "ring-2 ring-indigo-400 bg-indigo-400/10 text-indigo-200";
          else if (
            Array.isArray(payload.highlighted) && payload.highlighted.includes(i)
          ) ring = "ring-2 ring-emerald-400 bg-emerald-400/10 text-emerald-200";

          return (
            <div
              key={i}
              className={`flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700
                          text-sm font-mono transition-all duration-300 ${ring || "text-zinc-300"}`}
            >
              {String(val)}
            </div>
          );
        })}
      </div>
      {(h.low !== undefined || h.high !== undefined || h.mid !== undefined) && (
        <div className="mt-2 flex gap-4 text-[10px] text-zinc-500">
          {h.low !== undefined && <span>low={h.low}</span>}
          {h.mid !== undefined && <span className="text-amber-400">mid={h.mid}</span>}
          {h.high !== undefined && <span>high={h.high}</span>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree renderer — highlights a single node
// ---------------------------------------------------------------------------
function TreeRenderer({ payload }: { payload: Record<string, any> }) {
  const nodes: any[] = payload.nodes ?? [];
  const highlighted: string = payload.highlighted ?? "";
  const label: string = payload.label ?? "";

  return (
    <div>
      {label && <p className="mb-2 text-xs text-zinc-400">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {nodes.map((n: any) => (
          <div
            key={n.id}
            className={`flex h-10 min-w-[2.5rem] items-center justify-center rounded-full border
                        px-2 text-sm font-mono transition-all duration-300
                        ${n.id === highlighted
                          ? "border-amber-400 bg-amber-400/20 text-amber-200 ring-2 ring-amber-400"
                          : "border-zinc-700 text-zinc-300"
                        }`}
          >
            {String(n.value)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linked-list renderer — highlights pointer position
// ---------------------------------------------------------------------------
function LinkedListRenderer({ payload }: { payload: Record<string, any> }) {
  const nodes: any[] = payload.nodes ?? [];
  const pointer: number = payload.pointer ?? -1;
  const label: string = payload.label ?? "";

  return (
    <div>
      {label && <p className="mb-2 text-xs text-zinc-400">{label}</p>}
      <div className="flex items-center gap-1">
        {nodes.map((n: any, i: number) => (
          <div key={i} className="flex items-center gap-1">
            <div
              className={`flex h-10 min-w-[2.5rem] items-center justify-center rounded-md border
                          px-2 text-sm font-mono transition-all duration-300
                          ${i === pointer
                            ? "border-amber-400 bg-amber-400/20 text-amber-200 ring-2 ring-amber-400"
                            : "border-zinc-700 text-zinc-300"
                          }`}
            >
              {String(n.value)}
            </div>
            {i < nodes.length - 1 && (
              <svg className="h-4 w-4 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M5 12h14m-4-4 4 4-4 4" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic frame renderer — fallback
// ---------------------------------------------------------------------------
function GenericFrameRenderer({ payload }: { payload: Record<string, any> }) {
  const label: string = payload.label ?? "";
  return (
    <div>
      {label && <p className="mb-2 text-xs text-zinc-400">{label}</p>}
      <pre className="overflow-x-auto rounded-md bg-zinc-900 p-3 text-xs text-zinc-300">
        <code>{JSON.stringify(payload, null, 2)}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Frame dispatcher
// ---------------------------------------------------------------------------
function FrameRenderer({
  animation_type,
  payload,
}: {
  animation_type?: string;
  payload: Record<string, any>;
}) {
  switch (animation_type) {
    case "array_walk":
      return <ArrayWalkRenderer payload={payload} />;
    case "tree_traverse":
      return <TreeRenderer payload={payload} />;
    case "linked_list":
      return <LinkedListRenderer payload={payload} />;
    default:
      return <GenericFrameRenderer payload={payload} />;
  }
}

// ---------------------------------------------------------------------------
// Helper: build a playable Blob from accumulated base64 audio chunks
// ---------------------------------------------------------------------------
function mergeChunksToBlob(chunks: Uint8Array[]): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new Blob([merged], { type: "audio/mpeg" });
}

function decodeB64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Helper: play a blob and return a promise that resolves when playback ends
// ---------------------------------------------------------------------------
function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Audio playback failed"));
    };
    audio.play().catch((err) => {
      URL.revokeObjectURL(url);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function ChatPage() {
  const [query, setQuery] = useState("");
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  // Keep a ref to the current animation_type so frame entries know their renderer
  const currentAnimationType = useRef<string>("generic");

  // Auto-scroll to bottom
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline, playingIndex]);

  // ── Core: consume SSE stream, build event queue, process sequentially ────
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim() || loading) return;

      setTimeline([]);
      setError(null);
      setDone(false);
      setLoading(true);
      setPlayingIndex(null);

      try {
        const res = await fetch(`${API_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: query }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`Server responded with ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";

        // ── Sequential event queue ─────────────────────────────────
        // We accumulate audio chunks into a buffer and process complete
        // "narration units" (audio_start → audio_chunks → audio_done)
        // as atomic entries.  Visuals and frames are pushed immediately.
        // After each audio entry, we AWAIT playback before continuing
        // to read the next events.  This gives the backend full pacing
        // control — the backend won't send the next action until the
        // SSE pipe drains, so natural backpressure applies.

        let audioChunks: Uint8Array[] = [];
        let audioText = "";

        const processEvent = async (event: SSEEvent) => {
          switch (event.type) {
            case "audio_start": {
              audioChunks = [];
              audioText = event.text;
              break;
            }

            case "audio_chunk": {
              audioChunks.push(decodeB64(event.data));
              break;
            }

            case "audio_done": {
              // Build blob, push timeline entry, play and WAIT
              const blob = mergeChunksToBlob(audioChunks);
              const entry: TimelineEntry = {
                kind: "narration",
                text: audioText,
                audioBlob: blob,
              };
              setTimeline((prev) => {
                const idx = prev.length;
                setPlayingIndex(idx);
                return [...prev, entry];
              });

              try {
                await playBlob(blob);
              } catch {
                // Autoplay may be blocked on first interaction.
                // We still advance so the stream doesn't stall.
                setError(
                  "Browser blocked autoplay. Interact with the page and try again."
                );
              }
              setPlayingIndex(null);
              audioChunks = [];
              audioText = "";
              break;
            }

            case "visual": {
              setTimeline((prev) => [
                ...prev,
                {
                  kind: "visual",
                  visual_type: event.visual_type,
                  payload: event.payload,
                },
              ]);
              break;
            }

            case "animation_start": {
              currentAnimationType.current = event.animation_type;
              break;
            }

            case "frame": {
              setTimeline((prev) => [
                ...prev,
                {
                  kind: "frame",
                  animation_type: currentAnimationType.current,
                  payload: event.payload,
                  frameIndex: event.index,
                  totalFrames: event.total,
                },
              ]);
              break;
            }

            case "animation_done": {
              // No-op — animation is already rendered frame-by-frame
              break;
            }

            case "done": {
              setDone(true);
              break;
            }
          }
        };

        // ── Read loop ──────────────────────────────────────────────
        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const parts = sseBuffer.split("\n\n");
          sseBuffer = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data: ")) continue;

            let event: SSEEvent;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            // Process each event sequentially — audio_done awaits playback
            await processEvent(event);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [query, loading]
  );

  // ── Replay a narration entry ─────────────────────────────────────────────
  const replayAudio = useCallback(async (idx: number) => {
    const entry = timeline[idx];
    if (!entry?.audioBlob) return;
    setPlayingIndex(idx);
    try {
      await playBlob(entry.audioBlob);
    } catch { /* ignore */ }
    setPlayingIndex(null);
  }, [timeline]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-8 text-center text-3xl font-bold tracking-tight">
          Outlrn
        </h1>

        {/* Input */}
        <form onSubmit={handleSubmit} className="mb-10 flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything..."
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm
                       placeholder-zinc-500 outline-none ring-offset-zinc-950
                       focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium
                       transition hover:bg-indigo-500 disabled:opacity-40"
          >
            {loading ? "Teaching..." : "Ask"}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-4">
          {timeline.map((entry, idx) => (
            <div key={idx}>
              {/* ── Narration ──────────────────────────────────────── */}
              {entry.kind === "narration" && (
                <div
                  className={`rounded-xl border p-4 shadow-lg transition-all duration-300 ${
                    playingIndex === idx
                      ? "border-indigo-500 bg-indigo-950/30"
                      : "border-zinc-800 bg-zinc-900"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {playingIndex === idx ? (
                        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
                      ) : (
                        <svg className="h-3 w-3 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      )}
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                        {playingIndex === idx ? "Speaking..." : "Narration"}
                      </span>
                    </div>
                    {playingIndex !== idx && entry.audioBlob && (
                      <button
                        onClick={() => replayAudio(idx)}
                        className="flex items-center gap-1.5 rounded-md border border-zinc-700
                                   px-2.5 py-1 text-[10px] transition hover:border-zinc-500 hover:text-white"
                      >
                        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Replay
                      </button>
                    )}
                  </div>
                  <p className="leading-relaxed text-zinc-300 text-sm">
                    {entry.text}
                  </p>
                </div>
              )}

              {/* ── Static visual (Mermaid / Browser) ─────────────── */}
              {entry.kind === "visual" && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-lg">
                  {entry.visual_type === "MERMAID" ? (
                    <div>
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-500">
                        Diagram
                      </div>
                      {entry.payload?.description && (
                        <p className="mb-3 text-xs text-zinc-400">
                          {entry.payload.description}
                        </p>
                      )}
                      <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-300">
                        <code>{entry.payload?.code}</code>
                      </pre>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-sky-500">
                        UI Sandbox
                      </div>
                      {entry.payload?.description && (
                        <p className="mb-3 text-xs text-zinc-400">
                          {entry.payload.description}
                        </p>
                      )}
                      <div
                        className="prose prose-invert max-w-none"
                        dangerouslySetInnerHTML={{
                          __html: (entry.payload?.html as string) ?? "",
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ── Animation frame ───────────────────────────────── */}
              {entry.kind === "frame" && entry.payload && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-lg">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-500">
                      Animation
                    </span>
                    {entry.totalFrames !== undefined && entry.frameIndex !== undefined && (
                      <span className="text-[10px] text-zinc-500">
                        Frame {entry.frameIndex + 1} / {entry.totalFrames}
                      </span>
                    )}
                  </div>
                  <FrameRenderer
                    animation_type={entry.animation_type}
                    payload={entry.payload}
                  />
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator while waiting for next event */}
          {loading && !done && (
            <div className="flex items-center gap-2 px-4 py-2 text-xs text-zinc-500">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
              {playingIndex !== null ? "Listening..." : "Thinking..."}
            </div>
          )}
        </div>

        {/* Done */}
        {done && timeline.length > 0 && (
          <p className="mt-8 text-center text-xs text-zinc-600">
            Lesson complete
          </p>
        )}

        <div ref={bottomRef} />
      </div>
    </main>
  );
}
