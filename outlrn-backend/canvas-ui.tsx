'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { GraphCard, GraphFocusContent } from '@/components/canvas/graph-card'; // Add this line
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence, animate } from 'framer-motion';
import {
  Menu,
  ArrowUp,
  Loader2,
  MessageSquare,
  ChevronDown,
  MousePointer2,
  Hand,
  Type,
  StickyNote,
  Pencil,
  Eraser,
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronRight,
  X,
  RotateCcw,
  Lightbulb,
} from 'lucide-react';

import type {
  ChatSession,
  ChatMessage,
  CanvasElementData,
  CanvasArrowData,
  AnimationStep,
  Position,
  Size,
} from '@/components/canvas/types';
import { AuthModal } from '@/components/canvas/auth-modal';
import { CanvasSidebar } from '@/components/canvas/canvas-sidebar';
import { TheoryCard } from '@/components/canvas/theory-card';
import { CodeCard } from '@/components/canvas/code-card';
import { AnimationCard } from '@/components/canvas/animation-card';
import { CanvasArrow } from '@/components/canvas/canvas-arrow';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

// ── Supabase ──

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ── Constants & helpers ──

const SESSIONS_KEY = 'outlrn_canvas_sessions';

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  for (const byte of array) id += chars[byte % chars.length];
  return id;
}

function loadSessions(): ChatSession[] {
  try {
    const stored = localStorage.getItem(SESSIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: ChatSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

// ── Backend API ──
const API_BASE = 'http://localhost:8000';

// ══════════════════════════════════════════════
// ── Component ──
// ══════════════════════════════════════════════

export default function CanvasPage() {
  // ── Auth state ──
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
// ── Checkpoint state ──
const [checkpoint, setCheckpoint] = useState<{
  title: string;
  options: { label: string; value: string }[];
} | null>(null);
  // ── Sidebar ──
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Sessions & chat ──
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [chatPanelOpen, setChatPanelOpen] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Canvas transform ──
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasOffsetRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
// --- Add these refs ---
const cardIndexRef = useRef(0);
const lastCardIdRef = useRef<string | null>(null);
  // ── Canvas elements ──
  const [canvasElements, setCanvasElements] = useState<CanvasElementData[]>([]);
  const [canvasArrows, setCanvasArrows] = useState<CanvasArrowData[]>([]);
  const [canvasTitle, setCanvasTitle] = useState<string | null>(null);

  // ── Focus mode ──
  const [focusedElementId, setFocusedElementId] = useState<string | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const replayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Auto-hide input ──
  const [showInputBar, setShowInputBar] = useState(true);

  // ── Chat auto-hide timer ──
  const chatAutoHideRef = useRef<NodeJS.Timeout | null>(null);

  // ── Motion blur during camera pan ──
  const [motionBlur, setMotionBlur] = useState(0);

  // ── Streaming state ──
  const [isStreaming, setIsStreaming] = useState(false);

  // ── Keep refs in sync ──
  useEffect(() => {
    canvasOffsetRef.current = canvasOffset;
  }, [canvasOffset]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // ══════════════════════════════════════════════
  // ── Auth ──
  // ══════════════════════════════════════════════

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session?.user) setShowAuthModal(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setShowAuthModal(false);
        if (window.location.hash?.includes('access_token')) {
          window.history.replaceState(
            null,
            '',
            window.location.pathname + window.location.search
          );
        }
      } else {
        setShowAuthModal(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Load / persist sessions ──
  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  useEffect(() => {
    if (!loading) saveSessions(sessions);
  }, [sessions, loading]);

  // ── Auto-scroll chat panel ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages?.length]);

  // ══════════════════════════════════════════════
  // ── Canvas pan ──
  // ══════════════════════════════════════════════

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== canvasRef.current) return;
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        offsetX: canvasOffset.x,
        offsetY: canvasOffset.y,
      };
    },
    [canvasOffset]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setCanvasOffset({
        x: dragStart.current.offsetX + (e.clientX - dragStart.current.x),
        y: dragStart.current.offsetY + (e.clientY - dragStart.current.y),
      });
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // ── Scroll → zoom towards cursor ──
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const delta = -e.deltaY * 0.001;
      const oldZoom = zoomRef.current;
      const newZoom = Math.max(0.2, Math.min(3, oldZoom + delta * oldZoom));
      const scale = newZoom / oldZoom;

      // Cursor position in screen space
      const mx = e.clientX;
      const my = e.clientY;

      // Adjust offset so the point under the cursor stays fixed
      const oldOffset = canvasOffsetRef.current;
      const newOffsetX = mx - (mx - oldOffset.x) * scale;
      const newOffsetY = my - (my - oldOffset.y) * scale;

      setZoom(newZoom);
      setCanvasOffset({ x: newOffsetX, y: newOffsetY });
    };
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  // ══════════════════════════════════════════════
  // ── Auto-hide input bar ──
  // ══════════════════════════════════════════════

  useEffect(() => {
    if (canvasElements.length === 0) {
      setShowInputBar(true);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      setShowInputBar(e.clientY > window.innerHeight - 100);
    };

    setShowInputBar(false);
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [canvasElements.length]);

  // ══════════════════════════════════════════════
  // ── Camera animation ──
  // ══════════════════════════════════════════════

  const animateCameraTo = useCallback(
    (targetX: number, targetY: number, duration: number): Promise<void> => {
      return new Promise((resolve) => {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const z = zoomRef.current;

        const finalX = cx - targetX * z;
        const finalY = cy - targetY * z;

        const startX = canvasOffsetRef.current.x;
        const startY = canvasOffsetRef.current.y;

        if (duration <= 0) {
          setCanvasOffset({ x: finalX, y: finalY });
          resolve();
          return;
        }

        animate(0, 1, {
          duration,
          ease: [0.33, 1, 0.68, 1],
          onUpdate: (t) => {
            setCanvasOffset({
              x: startX + (finalX - startX) * t,
              y: startY + (finalY - startY) * t,
            });
          },
          onComplete: () => resolve(),
        });
      });
    },
    []
  );

  // ══════════════════════════════════════════════
  // ── Element manipulation callbacks ──
  // ══════════════════════════════════════════════

  const addElement = useCallback((element: CanvasElementData) => {
    setCanvasElements((prev) => [...prev, element]);
  }, []);

  const updateElementContent = useCallback(
    (id: string, partialContent: any) => {
      setCanvasElements((prev) =>
        prev.map((el) => {
          if (el.id !== id) return el;
          return { ...el, content: { ...el.content, ...partialContent } };
        })
      );
    },
    []
  );

  const resizeElement = useCallback((id: string, size: Size) => {
    setCanvasElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, size } : el))
    );
  }, []);

  const addArrow = useCallback((arrow: CanvasArrowData) => {
    setCanvasArrows((prev) => [...prev, arrow]);
  }, []);

  const updateArrowProgress = useCallback(
    (id: string, progress: number) => {
      setCanvasArrows((prev) =>
        prev.map((a) => (a.id === id ? { ...a, progress } : a))
      );
    },
    []
  );

  const handleElementMove = useCallback((id: string, position: Position) => {
    setCanvasElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, position } : el))
    );
  }, []);

  const handleElementResize = useCallback((id: string, size: Size) => {
    setCanvasElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, size } : el))
    );
  }, []);

  // ══════════════════════════════════════════════
  // ── Send message ──
  // ══════════════════════════════════════════════

const handleSend = useCallback(async (overrideText?: string, isChoice = false) => {
    let text = overrideText || inputValue.trim();
    
    if (isChoice) {
        // Just send the value (e.g., "proceed"). 
        // The backend knows this is a choice because it follows a CHECKPOINT.
        text = `[Choice]: ${overrideText}`; 
    }
    
  if (!text || isStreaming) return;

  setCheckpoint(null); // Clear any active checkpoint
    setIsStreaming(true);

    const newMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    let currentSession: ChatSession;

    if (activeSession) {
      currentSession = {
        ...activeSession,
        messages: [...activeSession.messages, newMessage],
        updatedAt: Date.now(),
      };
      setActiveSession(currentSession);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSession.id ? currentSession : s
        )
      );
    } else {
      currentSession = {
        id: generateId(),
        title: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
        messages: [newMessage],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setActiveSession(currentSession);
      setSessions((prev) => [currentSession, ...prev]);
    }

    setInputValue('');
    setChatPanelOpen(true);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // Auto-hide chat panel after 5 s
    if (chatAutoHideRef.current) clearTimeout(chatAutoHideRef.current);
    chatAutoHideRef.current = setTimeout(() => setChatPanelOpen(false), 5000);

    // Add assistant "thinking" message
    const thinkingMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: 'Setting up your lesson…',
      timestamp: Date.now(),
    };
    const sessionWithReply: ChatSession = {
      ...currentSession,
      messages: [...currentSession.messages, thinkingMsg],
      updatedAt: Date.now(),
    };
    setActiveSession(sessionWithReply);
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionWithReply.id ? sessionWithReply : s))
    );

    // ── Consume SSE stream from backend ──
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: currentSession.id, message: text }),
      });

      if (!res.ok || !res.body) throw new Error('Backend unreachable');

      // Set canvas title immediately
      setCanvasTitle(text.slice(0, 50));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const groupId = currentSession.id;
      
      let currentAnimId: string | null = null;
      let currentCodeExplainerId: string | null = null;
      let animSteps: AnimationStep[] = [];
      let audioChunks: string[] = [];
      let inAnimation = false;
      let currentGraphId: string | null = null; // Add this
      let graphFrames: any[] = []; // Add this

      const baseX = 200;
      const cardY = 200;
      const cardSpacing = 900;

      // Viewport-relative card sizes
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 900;

      const contentBigW = Math.round(vw * 0.55);
      const contentBigH = Math.round(vh * 0.72);
      const contentSmall = { width: 380, height: 320 };

      const animBigW = Math.round(vw * 0.62);
      const animBigH = Math.round(vh * 0.6);
      const animSmall = { width: 440, height: 300 };

      const codeBigW = Math.round(vw * 0.58);
      const codeBigH = Math.round(vh * 0.7);
      const codeSmall = { width: 420, height: 300 };


const graphBigW = Math.round(vw * 0.6);
const graphBigH = Math.round(vh * 0.65);
const graphSmall = { width: 440, height: 320 };

      // Helper — animate arrow drawing
      const drawArrow = async (fromId: string, toId: string) => {
        const arrowId = `arrow_${groupId}_${cardIndexRef.current}`;
        addArrow({ id: arrowId, fromId, toId, progress: 0 } as CanvasArrowData);
        for (let p = 0; p <= 10; p++) {
          updateArrowProgress(arrowId, Math.min(p / 10, 1));
          await new Promise((r) => setTimeout(r, 40));
        }
      };

      // Helper — play collected base64 audio chunks
      const playAudio = (chunks: string[]): Promise<void> => {
        return new Promise((resolve) => {
          try {
            const parts = chunks.map((c) => {
              const raw = atob(c);
              const bytes = new Uint8Array(raw.length);
              for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
              return bytes;
            });
            const blob = new Blob(parts, { type: 'audio/mpeg' });
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
            audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
            audio.play().catch(() => resolve());
          } catch {
            resolve();
          }
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const match = part.match(/^data:\s*(.+)$/m);
          if (!match) continue;

          let ev: any;
          try { ev = JSON.parse(match[1]); } catch { continue; }

          switch (ev.type) {
            // ── Content card (companion to narration — instant, non-blocking) ──
            case 'graph_start': {
  const cardId = `graph_${groupId}_${cardIndexRef.current}`;
  currentGraphId = cardId;
  graphFrames = [];
  const x = baseX + cardIndexRef.current * cardSpacing;

  addElement({
    id: cardId,
    type: 'graph',
    position: { x, y: cardY },
    size: { width: graphBigW, height: graphBigH },
    content: {
      graph: ev.graph || { nodes: [], edges: [], directed: false },
      frames: [],
      currentFrame: 0,
      graphType: ev.graph_type || 'bfs',
    },
    visible: true,
    label: 'Graph Visualization',
    groupId,
  } as CanvasElementData);

  if (lastCardIdRef.current) await drawArrow(lastCardIdRef.current, cardId);
  await animateCameraTo(x + graphBigW / 2, cardY + graphBigH / 2, 0.9);

  lastCardIdRef.current = cardId;
  cardIndexRef.current++;
  break;
}

case 'graph_frame': {
  if (!currentGraphId) break;
  const payload = ev.payload || {};
  graphFrames = [...graphFrames, payload];
  updateElementContent(currentGraphId, {
    frames: graphFrames,
    currentFrame: graphFrames.length - 1,
  });
  break;
}

case 'graph_done': {
  if (currentGraphId) {
    await new Promise((r) => setTimeout(r, 600));
    resizeElement(currentGraphId, graphSmall);
  }
  currentGraphId = null;
  break;
}
            case 'content_card': {
              const cardId = `content_${groupId}_${cardIndexRef.current}`;
              const x = baseX + cardIndexRef.current * cardSpacing;
              const cardW = 440;
              const cardH = 300;
              const bodyText: string = ev.body || '';

              // Create card at final size with full text shown immediately
              addElement({
                id: cardId,
                type: 'theory',
                position: { x, y: cardY },
                size: { width: cardW, height: cardH },
                content: { text: bodyText, streamedLength: bodyText.length },
                visible: true,
                label: ev.title || 'Content',
                groupId,
              } as CanvasElementData);

              // Arrow from previous (fire-and-forget, non-blocking)
              if (lastCardIdRef.current) {
                const prevId = lastCardIdRef.current;
                const arrowId = `arrow_${groupId}_${cardIndexRef.current}`;
                addArrow({ id: arrowId, fromId: prevId, toId: cardId, progress: 0 } as CanvasArrowData);
                (async () => {
                  for (let p = 0; p <= 10; p++) {
                    updateArrowProgress(arrowId, Math.min(p / 10, 1));
                    await new Promise((r) => setTimeout(r, 30));
                  }
                })();
              }

              // Camera pan (fire-and-forget, non-blocking)
              animateCameraTo(x + cardW / 2, cardY + cardH / 2, 0.6);

              lastCardIdRef.current = cardId;
              cardIndexRef.current++;
              break;
            }

            case 'checkpoint': {
              setCheckpoint({
                title: ev.title || 'Check-in',
                options: ev.options || [],
              });
              // Backend owns conversation state — nothing else needed here
              break;
            }

            // ── Animation start ──
            case 'animation_start': {
              inAnimation = true;
              const cardId = `anim_${groupId}_${cardIndexRef.current}`;
              currentAnimId = cardId;
              animSteps = [];
              const x = baseX + cardIndexRef.current * cardSpacing;

              addElement({
                id: cardId,
                type: 'animation',
                position: { x, y: cardY },
                size: { width: animBigW, height: animBigH },
                content: {
                  array: ev.array || [],
                  target: ev.target ?? null,
                  steps: [],
                  currentStep: 0,
                },
                visible: true,
                label: 'Visualization',
                groupId,
              } as CanvasElementData);

              if (lastCardIdRef.current) await drawArrow(lastCardIdRef.current, cardId);
              await animateCameraTo(x + animBigW / 2, cardY + animBigH / 2, 0.9);

              lastCardIdRef.current = cardId;
              cardIndexRef.current++;
              break;
            }

            // ── Animation frame ──
            case 'frame': {
              if (!currentAnimId) break;
              const payload = ev.payload || {};

              // Detect format: new (pointers obj + highlights array)
              // vs old (highlights obj with low/high/mid)
              let ptrs: Record<string, number>;
              let hlIdx: number[];
              let range: [number, number] | null = payload.activeRange ?? null;

              if (payload.pointers && typeof payload.pointers === 'object') {
                // ── New format ──
                ptrs = payload.pointers;
                hlIdx = Array.isArray(payload.highlights) ? payload.highlights : [];
              } else if (
                payload.highlights &&
                typeof payload.highlights === 'object' &&
                !Array.isArray(payload.highlights)
              ) {
                // ── Old format: highlights is {low, high, mid} ──
                const hl = payload.highlights;
                ptrs = {};
                if (hl.low != null) ptrs['L'] = hl.low;
                if (hl.high != null) ptrs['R'] = hl.high;
                if (hl.mid != null) ptrs['M'] = hl.mid;
                hlIdx = hl.mid != null ? [hl.mid] : [];
                if (hl.low != null && hl.high != null) range = [hl.low, hl.high];
              } else {
                ptrs = {};
                hlIdx = Array.isArray(payload.highlights) ? payload.highlights : [];
              }

              const ptrKeys = Object.keys(ptrs);

              const step: any = {
                // Legacy fields (best-effort for any remaining compat)
                left: ptrs[ptrKeys[0]] ?? -1,
                right: ptrs[ptrKeys[ptrKeys.length - 1]] ?? -1,
                mid: ptrs[ptrKeys[Math.floor(ptrKeys.length / 2)]] ?? -1,
                found: ev.index === ev.total - 1,
                description: payload.label || '',
                // Dynamic fields
                _pointers: ptrs,
                _highlights: hlIdx,
                _activeRange: range,
                _array: payload.array,
              };

              animSteps = [...animSteps, step];
              updateElementContent(currentAnimId, {
                steps: animSteps,
                currentStep: animSteps.length - 1,
                ...(payload.array ? { array: payload.array } : {}),
              });
              break;
            }

            // ── Animation done ──
            case 'animation_done': {
              inAnimation = false;
              if (currentAnimId) {
                await new Promise((r) => setTimeout(r, 600));
                resizeElement(currentAnimId, animSmall);
              }
              currentAnimId = null;
              break;
            }

            // ── Code explainer start ──
            case 'code_explainer_start': {
              const cardId = `code_${groupId}_${cardIndexRef.current}`;
              currentCodeExplainerId = cardId;
              const x = baseX + cardIndexRef.current * cardSpacing;
              const totalLines = (ev.code || '').split('\n').length;

              addElement({
                id: cardId,
                type: 'code',
                position: { x, y: cardY },
                size: { width: codeBigW, height: codeBigH },
                content: {
                  code: ev.code || '',
                  language: ev.language || 'python',
                  revealedLines: totalLines,
                  highlightedLine: -1,
                  highlightedRange: null,
                  segments: [],
                  currentSegment: -1,
                },
                visible: true,
                label: ev.title || 'Code',
                groupId,
              } as CanvasElementData);

              if (lastCardIdRef.current) await drawArrow(lastCardIdRef.current, cardId);
              await animateCameraTo(x + codeBigW / 2, cardY + codeBigH / 2, 0.9);

              lastCardIdRef.current = cardId;
              cardIndexRef.current++;
              break;
            }

            // ── Code segment highlight ──
            case 'code_segment': {
              if (currentCodeExplainerId) {
                updateElementContent(currentCodeExplainerId, {
                  highlightedRange: ev.lines || null,
                  currentSegment: ev.index ?? -1,
                });
              }
              break;
            }

            // ── Code explainer done ──
            case 'code_explainer_done': {
              if (currentCodeExplainerId) {
                updateElementContent(currentCodeExplainerId, {
                  highlightedRange: null,
                  highlightedLine: -1,
                  currentSegment: -1,
                });
                await new Promise((r) => setTimeout(r, 600));
                resizeElement(currentCodeExplainerId, codeSmall);
              }
              currentCodeExplainerId = null;
              break;
            }

            // ── Audio events (narration / per-frame voice) ──
            case 'audio_start': {
              audioChunks = [];
              break;
            }
            case 'audio_chunk': {
              audioChunks.push(ev.data);
              break;
            }
            case 'audio_done': {
              if (audioChunks.length > 0) {
                // Always wait for audio to finish before processing the next
                // action.  This keeps cards synced with their narration — the
                // companion content card already appeared instantly (before
                // audio_start), so there's zero extra delay for it.  We just
                // hold here so the *next* card doesn't pop up while this
                // narration is still playing.
                await playAudio(audioChunks);
              }
              audioChunks = [];
              break;
            }

            // ── Done ──
            case 'done': {
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error('Stream error:', err);
      const errMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: 'Something went wrong connecting to the lesson backend. Please try again.',
        timestamp: Date.now(),
      };
      setActiveSession((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, errMsg], updatedAt: Date.now() }
          : null
      );
    } finally {
      setIsStreaming(false);
    }
  }, [
    inputValue,
    activeSession,
    isStreaming,
    addElement,
    updateElementContent,
    resizeElement,
    addArrow,
    updateArrowProgress,
    animateCameraTo,
  ]);

  // ══════════════════════════════════════════════
  // ── Other handlers ──
  // ══════════════════════════════════════════════

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = useCallback(() => {
    setActiveSession(null);
    setInputValue('');
    setCanvasElements([]);
    setCanvasArrows([]);
    setCanvasTitle(null);
    setCanvasOffset({ x: 0, y: 0 });
    setZoom(1);
    cardIndexRef.current = 0;
    lastCardIdRef.current = null;
  }, []);

  const handleSelectSession = useCallback((session: ChatSession) => {
    setActiveSession(session);
    setSidebarOpen(false);
    setCanvasElements([]);
    setCanvasArrows([]);
    setCanvasTitle(null);
    setCanvasOffset({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const handleDeleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSession?.id === id) {
        handleNewChat();
      }
    },
    [activeSession?.id, handleNewChat]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  // ── Focus mode helpers ──
  const handleFocusElement = useCallback((id: string) => {
    setFocusedElementId(id);
  }, []);

  const focusableElements = canvasElements.filter(
    (el) => el.type !== 'title' && el.visible
  );

  const focusedElement = focusedElementId
    ? canvasElements.find((el) => el.id === focusedElementId) ?? null
    : null;

  const focusedIndex = focusedElement
    ? focusableElements.findIndex((el) => el.id === focusedElement.id)
    : -1;

  const handleFocusPrev = useCallback(() => {
    if (focusedIndex > 0) {
      setFocusedElementId(focusableElements[focusedIndex - 1].id);
    }
  }, [focusedIndex, focusableElements]);

  const handleFocusNext = useCallback(() => {
    if (focusedIndex < focusableElements.length - 1) {
      setFocusedElementId(focusableElements[focusedIndex + 1].id);
    }
  }, [focusedIndex, focusableElements]);

  // Close focus on Escape
  useEffect(() => {
    if (!focusedElementId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocusedElementId(null);
      if (e.key === 'ArrowLeft') handleFocusPrev();
      if (e.key === 'ArrowRight') handleFocusNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedElementId, handleFocusPrev, handleFocusNext]);

  // Cleanup replay timer on focus change or unmount
  useEffect(() => {
    return () => {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        setIsReplaying(false);
      }
    };
  }, [focusedElementId]);

  const handleReplayElement = useCallback((elementId: string) => {
    if (isReplaying) return;
    const el = canvasElements.find((e) => e.id === elementId);
    if (!el) return;

    setIsReplaying(true);

    // Clear any existing timer
    if (replayTimerRef.current) clearInterval(replayTimerRef.current);

    switch (el.type) {
      case 'graph': {
  const content = el.content as any;
  const totalFrames = content.frames?.length || 0;
  if (totalFrames === 0) { setIsReplaying(false); break; }
  updateElementContent(el.id, { currentFrame: 0 });
  let frameIdx = 0;
  replayTimerRef.current = setInterval(() => {
    frameIdx++;
    if (frameIdx >= totalFrames) {
      clearInterval(replayTimerRef.current!);
      replayTimerRef.current = null;
      setIsReplaying(false);
    } else {
      updateElementContent(el.id, { currentFrame: frameIdx });
    }
  }, 1000); // Adjust speed as needed
  break;
}
      case 'theory': {
        const content = el.content as import('@/components/canvas/types').TheoryContent;
        const fullLength = content.text.length;
        updateElementContent(el.id, { streamedLength: 0 });
        let current = 0;
        replayTimerRef.current = setInterval(() => {
          current = Math.min(current + 3, fullLength);
          updateElementContent(el.id, { streamedLength: current });
          if (current >= fullLength) {
            clearInterval(replayTimerRef.current!);
            replayTimerRef.current = null;
            setIsReplaying(false);
          }
        }, 10);
        break;
      }
      case 'animation': {
        const content = el.content as import('@/components/canvas/types').AnimationContent;
        const totalSteps = content.steps.length;
        updateElementContent(el.id, { currentStep: 0 });
        let step = 0;
        replayTimerRef.current = setInterval(() => {
          step++;
          if (step >= totalSteps) {
            clearInterval(replayTimerRef.current!);
            replayTimerRef.current = null;
            setIsReplaying(false);
          } else {
            updateElementContent(el.id, { currentStep: step });
          }
        }, 2000);
        break;
      }
      case 'code': {
        const content = el.content as import('@/components/canvas/types').CodeContent;
        const segments: Array<{ lines: [number, number]; explanation?: string }> = (content as any).segments || [];

        if (segments.length > 0) {
          // Segment-based replay: step through each segment range
          let segIdx = 0;
          updateElementContent(el.id, { highlightedRange: segments[0]?.lines ?? null, currentSegment: 0, highlightedLine: -1 });
          replayTimerRef.current = setInterval(() => {
            segIdx++;
            if (segIdx >= segments.length) {
              updateElementContent(el.id, { highlightedRange: null, currentSegment: -1, highlightedLine: -1 });
              clearInterval(replayTimerRef.current!);
              replayTimerRef.current = null;
              setIsReplaying(false);
            } else {
              updateElementContent(el.id, { highlightedRange: segments[segIdx].lines, currentSegment: segIdx });
            }
          }, 2000);
        } else {
          // Fallback: line-by-line replay (original behavior)
          const totalLines = content.code.split('\n').length;
          updateElementContent(el.id, { revealedLines: 0, highlightedLine: -1, highlightedRange: null });
          let line = 0;
          replayTimerRef.current = setInterval(() => {
            line++;
            updateElementContent(el.id, { revealedLines: line, highlightedLine: line });
            if (line >= totalLines) {
              clearInterval(replayTimerRef.current!);
              let hlLine = 1;
              updateElementContent(el.id, { highlightedLine: 1 });
              replayTimerRef.current = setInterval(() => {
                hlLine++;
                if (hlLine > totalLines) {
                  updateElementContent(el.id, { highlightedLine: -1 });
                  clearInterval(replayTimerRef.current!);
                  replayTimerRef.current = null;
                  setIsReplaying(false);
                } else {
                  updateElementContent(el.id, { highlightedLine: hlLine });
                }
              }, 400);
            }
          }, 120);
        }
        break;
      }
    }
  }, [isReplaying, canvasElements, updateElementContent]);

  // Convenience wrapper for focus overlay
  const handleReplay = useCallback(() => {
    if (focusedElement) handleReplayElement(focusedElement.id);
  }, [focusedElement, handleReplayElement]);

  // ── Render element for focus overlay ──
  const renderFocusedContent = (el: CanvasElementData) => {
    switch (el.type) {
      
      case 'theory': {
        const content = el.content as import('@/components/canvas/types').TheoryContent;
        const displayedText = content.text.slice(0, content.streamedLength);
        const isStreaming = content.streamedLength < content.text.length;
        return (
          <div className="p-6 canvas-theory-prose overflow-auto h-full">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              h1: ({ children }) => <h1 className="text-xl font-bold text-gray-800 mb-3 mt-0">{children}</h1>,
              h2: ({ children }) => <h2 className="text-lg font-semibold text-gray-800 mb-2 mt-4">{children}</h2>,
              h3: ({ children }) => <h3 className="text-base font-semibold text-gray-700 mb-2 mt-3">{children}</h3>,
              p: ({ children }) => <p className="text-sm leading-relaxed text-gray-600 mb-3 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="text-sm leading-relaxed text-gray-600 mb-3 pl-5 space-y-1.5 list-disc">{children}</ul>,
              ol: ({ children }) => <ol className="text-sm leading-relaxed text-gray-600 mb-3 pl-5 space-y-1.5 list-decimal">{children}</ol>,
              li: ({ children }) => <li className="text-sm leading-relaxed text-gray-600">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-gray-800">{children}</strong>,
              em: ({ children }) => <em className="italic text-gray-600">{children}</em>,
              code: ({ children, className }) => {
                const isBlock = className?.includes('language-');
                if (isBlock) return <code className="block bg-[#F0EDE8] rounded-lg p-4 text-[13px] font-mono text-[#5C574F] my-2 overflow-x-auto">{children}</code>;
                return <code className="bg-[#F0EDE8] rounded px-1.5 py-0.5 text-[13px] font-mono text-[#5C574F]">{children}</code>;
              },
              blockquote: ({ children }) => <blockquote className="border-l-2 border-[#bcd4fc] pl-4 my-3 text-sm text-gray-500 italic">{children}</blockquote>,
              hr: () => <hr className="my-4 border-[#DDD9D3]" />,
              table: ({ children }) => <div className="overflow-x-auto my-3"><table className="text-[13px] w-full border-collapse">{children}</table></div>,
              th: ({ children }) => <th className="border border-[#DDD9D3] bg-[#F0EDE8] px-3 py-1.5 text-left font-semibold text-[#5C574F] text-[13px]">{children}</th>,
              td: ({ children }) => <td className="border border-[#DDD9D3] px-3 py-1.5 text-[#6B665F] text-[13px]">{children}</td>,
            }}>
              {displayedText}
            </ReactMarkdown>
            {isStreaming && <span className="inline-block w-[2px] h-4 bg-[#4a7fdc] ml-0.5 align-middle animate-pulse rounded-full" />}
          </div>
        );
      }
      case 'animation': {
        const content = el.content as any;
        const step = content.steps?.[content.currentStep];

        // ── Pointer colors (one per distinct label) ──
        const PCOLORS = [
          { text: '#4a7fdc', bg: '#EFF4FE', border: '#bcd4fc' },
          { text: '#e57c23', bg: '#FFF4EB', border: '#fad4a8' },
          { text: '#22a867', bg: '#EEFBF3', border: '#a8e6c9' },
          { text: '#c94f6d', bg: '#FDF0F3', border: '#f0b8c6' },
          { text: '#8b5cf6', bg: '#F5F0FF', border: '#d4bffc' },
        ];

        // Dynamic pointers from backend — fall back to legacy L/M/R
        const pointers: Record<string, number> = step?._pointers
          || (step ? { L: step.left, M: step.mid, R: step.right } : {});
        const pointerLabels = Object.keys(pointers);
        const colorOf = (label: string) => PCOLORS[pointerLabels.indexOf(label) % PCOLORS.length];

        // Highlights — indices being compared / swapped
        const highlights: number[] = step?._highlights || (step ? [step.mid] : []);

        // Per-frame array (may change each frame for sorting); fall back to base
        const displayArray: number[] = step?._array || content.array || [];

        // Dimmed: only when activeRange is set (search narrowing)
        const activeRange: [number, number] | null = step?._activeRange ?? null;
        const dimmedIndices: number[] = activeRange
          ? displayArray.map((_, i: number) => i).filter((i: number) => i < activeRange[0] || i > activeRange[1])
          : [];

        const isFound = step?.found;

        return (
          <div className="flex-1 w-full h-full flex flex-col items-center justify-center overflow-auto p-6">
            <div className="flex gap-3 flex-wrap justify-center pt-8">
              {displayArray.map((val: number, idx: number) => {
                const isHL = highlights.includes(idx);
                const isDimmed = dimmedIndices.includes(idx);
                const isFoundCell = isFound && highlights.includes(idx);
                const activePointers = Object.entries(pointers)
                  .filter(([, ptrIdx]) => ptrIdx === idx)
                  .map(([name]) => name);
                return (
                  <div key={idx} className="relative flex flex-col items-center" style={{ opacity: isDimmed ? 0.25 : 1, transform: isHL ? 'scale(1.06)' : 'scale(1)', transition: 'all 0.3s ease' }}>
                    {activePointers.length > 0 && (
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex gap-1 items-center">
                        {activePointers.map((p) => {
                          const c = colorOf(p);
                          return (
                            <span key={p} className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full tracking-wider border whitespace-nowrap" style={{ color: c.text, backgroundColor: c.bg, borderColor: c.border }}>{p}</span>
                          );
                        })}
                      </div>
                    )}
                    <div className="w-14 h-14 flex items-center justify-center rounded-lg border text-base font-bold font-mono" style={{
                      background: isFoundCell || isHL ? '#E8F0FE' : '#F4F1EC',
                      borderColor: isFoundCell || isHL ? '#bcd4fc' : '#DDD9D3',
                      color: isFoundCell || isHL ? '#4a7fdc' : '#7A756E',
                      boxShadow: isFoundCell ? '0 0 20px rgba(74,127,220,0.18)' : isHL ? '0 0 14px rgba(74,127,220,0.08)' : 'none',
                    }}>{val}</div>
                    <span className="mt-1.5 text-[10px] text-[#A9A49D] font-mono">{idx}</span>
                  </div>
                );
              })}
            </div>
            {step && <p className="text-sm text-[#8C857C] leading-relaxed mt-6 text-center px-4">{step.description}</p>}
            {content.target != null && (
              <div className="text-center mt-3">
                <span className="text-xs font-mono text-[#A9A49D]">Target: <span className="text-[#4a7fdc] font-semibold">{content.target}</span></span>
              </div>
            )}
          </div>
        );
      }
      case 'code': {
        const content = el.content as import('@/components/canvas/types').CodeContent;
        const allLines = content.code.split('\n');
        const visibleCode = allLines.slice(0, content.revealedLines).join('\n');
        const hlLine = content.highlightedLine ?? -1;
        const hlRange: [number, number] | null = (content as any).highlightedRange ?? null;
        const rangeStart = hlRange ? hlRange[0] : -1;
        const rangeEnd = hlRange ? hlRange[1] : -1;
        return (
          <div className="h-full flex flex-col overflow-auto">
            <SyntaxHighlighter
              language={content.language}
              style={oneLight}
              showLineNumbers
              wrapLines
              lineProps={(lineNumber: number) => {
                const inRange = rangeStart > 0 && lineNumber >= rangeStart && lineNumber <= rangeEnd;
                const isSingleHL = !hlRange && lineNumber === hlLine;
                const isHighlighted = inRange || isSingleHL;
                return {
                  style: {
                    display: 'block',
                    borderLeft: isHighlighted ? '3px solid #4a7fdc' : '3px solid transparent',
                    backgroundColor: isHighlighted ? 'rgba(74, 127, 220, 0.07)' : 'transparent',
                    transition: 'all 0.3s ease',
                  },
                };
              }}
              customStyle={{ margin: 0, padding: '24px', fontSize: '14px', lineHeight: '1.8', background: 'transparent', minHeight: '100%' }}
              lineNumberStyle={{ color: '#c4c0ba', fontSize: '12px', minWidth: '2.5em' }}
            >
              {visibleCode || ' '}
            </SyntaxHighlighter>
          </div>
        );
      }
      case 'graph': {
  return <GraphFocusContent element={el} />;
}
      default:
        return null;
    }
  };

  // ── Render element helper ──
  const renderElement = (el: CanvasElementData) => {
    switch (el.type) {
      case 'graph':
  return (
    <GraphCard
      key={el.id}
      element={el}
      zoom={zoom}
      onMove={handleElementMove}
      onResize={handleElementResize}
      onFocus={handleFocusElement}
      onReplay={handleReplayElement}
      onReExplain={() => {}}
      isReplaying={isReplaying}
    />
  );
      case 'title':
        return null; // Title is now rendered as a fixed overlay
      case 'theory':
        return (
          <TheoryCard
            key={el.id}
            element={el}
            zoom={zoom}
            onMove={handleElementMove}
            onResize={handleElementResize}
            onFocus={handleFocusElement}
            onReplay={handleReplayElement}
            onReExplain={() => {}}
            isReplaying={isReplaying}
          />
        );
      case 'animation':
        return (
          <AnimationCard
            key={el.id}
            element={el}
            zoom={zoom}
            onMove={handleElementMove}
            onResize={handleElementResize}
            onFocus={handleFocusElement}
            onReplay={handleReplayElement}
            onReExplain={() => {}}
            isReplaying={isReplaying}
          />
        );
      case 'code':
        return (
          <CodeCard
            key={el.id}
            element={el}
            zoom={zoom}
            onMove={handleElementMove}
            onResize={handleElementResize}
            onFocus={handleFocusElement}
            onReplay={handleReplayElement}
            onReExplain={() => {}}
            isReplaying={isReplaying}
          />
        );
      default:
        return null;
    }
  };

  // ══════════════════════════════════════════════
  // ── Loading ──
  // ══════════════════════════════════════════════

  if (loading) {
    return (
      <div className="min-h-screen bg-[#E8E5DF] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#4a7fdc]" size={32} />
      </div>
    );
  }

  const hasMessages = activeSession && activeSession.messages.length > 0;
  const hasCanvasElements = canvasElements.length > 0;

  // ══════════════════════════════════════════════
  // ── JSX ──
  // ══════════════════════════════════════════════

  return (
    <div className="h-screen w-screen bg-[#E8E5DF] overflow-hidden relative">
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {/* ── Sidebar ── */}
      {user && (
        <CanvasSidebar
          isOpen={sidebarOpen}
          sessions={sessions}
          activeSessionId={activeSession?.id || null}
          user={user}
          onSelect={handleSelectSession}
          onDelete={handleDeleteSession}
          onNewChat={handleNewChat}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* ══ Layer 1: Pannable dotted background ══ */}
      <div
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          backgroundImage:
            'radial-gradient(circle, #D2CEC8 1px, transparent 1px)',
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${canvasOffset.x}px ${canvasOffset.y}px`,
          filter: motionBlur > 0 ? `blur(${motionBlur}px)` : 'none',
          
          transition: 'filter 0.2s ease-out',
        }}
        onMouseDown={handleCanvasMouseDown}
      />

      {/* ══ Layer 2: Canvas elements (moves with pan/zoom) ══ */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ zIndex: 5 }}
      >
        <div
          style={{
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Elements */}
          <AnimatePresence>
            {canvasElements
              .filter((el) => el.visible)
              .map((el) => renderElement(el))}
          </AnimatePresence>


          {/* ── Checkpoint Popup ── */}
<AnimatePresence>
  {checkpoint && (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-32 left-0 right-0 z-40 flex justify-center pointer-events-none"
    >
      <div className="bg-[#F7F5F2]/95 backdrop-blur-xl border border-[#bcd4fc]/40 shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-2xl p-5 max-w-md w-full mx-4 pointer-events-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-[#4a7fdc] animate-pulse" />
          <h3 className="text-[13px] font-semibold text-gray-700 uppercase tracking-wider">
            {checkpoint.title}
          </h3>
        </div>
        
        <div className="flex flex-col gap-2">
          {checkpoint.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(option.value, true)}
              className="w-full text-left px-4 py-3 rounded-xl bg-white border border-[#D8D4CE]/40 text-[14px] text-gray-600 hover:border-[#4a7fdc]/50 hover:bg-[#E8F0FE] hover:text-[#4a7fdc] transition-all duration-200 group flex items-center justify-between"
            >
              {option.label}
              <ChevronRight size={14} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )}
</AnimatePresence>

          {/* Arrows */}
          <svg
            className="absolute top-0 left-0 overflow-visible"
            style={{ width: 1, height: 1 }}
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <path d="M 0 0.5 L 7 3 L 0 5.5" fill="none" stroke="#94a3b8" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            </defs>
            {canvasArrows.map((arrow) => {
              const from = canvasElements.find((e) => e.id === arrow.fromId);
              const to = canvasElements.find((e) => e.id === arrow.toId);
              if (!from || !to) return null;
              return (
                <CanvasArrow
                  key={arrow.id}
                  arrow={arrow}
                  fromElement={from}
                  toElement={to}
                />
              );
            })}
          </svg>
        </div>
      </div>

      {/* ══ Layer 3: Fixed UI ══ */}

      {/* Fixed title — fades in centered, then floats up to top */}
      <AnimatePresence>
        {canvasTitle && (
          <motion.div
            initial={{
              opacity: 0,
              scale: 1.15,
              filter: 'blur(20px)',
              top: '45%',
              y: '-50%',
            }}
            animate={{
              opacity: 0.7,
              scale: 1,
              filter: 'blur(0px)',
              top: '20px',
              y: '0%',
            }}
            exit={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
            transition={{
              opacity: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
              scale: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
              filter: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
              top: { duration: 1.1, delay: 0.9, ease: [0.33, 1, 0.68, 1] },
              y: { duration: 1.1, delay: 0.9, ease: [0.33, 1, 0.68, 1] },
            }}
            className="fixed left-0 right-0 z-20 flex justify-center pointer-events-none"
          >
            <h2
              className="text-3xl font-bold text-gray-700"
              style={{ fontFamily: 'var(--font-caveat), cursive' }}
            >
              {canvasTitle}
            </h2>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hamburger — top left */}
      {user && (
        <div className="fixed top-3 left-3 z-20">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 bg-[#F7F5F2]/80 backdrop-blur-md hover:bg-[#F7F5F2] rounded-xl text-gray-400 hover:text-gray-600 transition-all shadow-sm border border-[#D8D4CE]/40"
          >
            <Menu size={20} />
          </button>
        </div>
      )}

      {/* ── Vertical toolbar — right side ── */}
      {user && (
        <div className="fixed top-1/2 -translate-y-1/2 right-3 z-20 flex flex-col gap-1">
          <div className="bg-[#F7F5F2]/90 backdrop-blur-md border border-[#D8D4CE]/50 rounded-xl shadow-lg shadow-black/[0.04] p-1.5 flex flex-col gap-0.5">
            {[
              { icon: MousePointer2, label: 'Select', active: true },
              { icon: Hand, label: 'Pan' },
              { icon: Type, label: 'Text' },
              { icon: StickyNote, label: 'Note' },
              { icon: Pencil, label: 'Draw' },
              { icon: Eraser, label: 'Eraser' },
            ].map(({ icon: Icon, label, active }) => (
              <button
                key={label}
                title={label}
                className={`p-2 rounded-lg transition-all duration-150 ${
                  active
                    ? 'bg-[#E8F0FE] text-[#4a7fdc] shadow-sm'
                    : 'text-[#9A958E] hover:bg-[#EFECE8] hover:text-[#6B665F]'
                }`}
              >
                <Icon size={17} strokeWidth={1.8} />
              </button>
            ))}
          </div>

          {/* Undo / Redo */}
          <div className="bg-[#F7F5F2]/90 backdrop-blur-md border border-[#D8D4CE]/50 rounded-xl shadow-lg shadow-black/[0.04] p-1.5 flex flex-col gap-0.5">
            <button
              title="Undo"
              className="p-2 rounded-lg text-[#9A958E] hover:bg-[#EFECE8] hover:text-[#6B665F] transition-all duration-150"
            >
              <Undo2 size={17} strokeWidth={1.8} />
            </button>
            <button
              title="Redo"
              className="p-2 rounded-lg text-[#9A958E] hover:bg-[#EFECE8] hover:text-[#6B665F] transition-all duration-150"
            >
              <Redo2 size={17} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      )}

      {/* ── Floating chat panel — bottom-right ── */}
      <AnimatePresence mode="wait">
        {hasMessages && chatPanelOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.4, y: 60 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.3,
              y: 60,
              transition: { duration: 0.35, ease: [0.4, 0, 0.7, 0.2] },
            }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: 'bottom right' }}
            className="fixed bottom-5 right-16 z-20 w-[320px] max-h-[45vh] flex flex-col"
            onMouseEnter={() => {
              // Cancel auto-hide when user hovers over chat
              if (chatAutoHideRef.current) clearTimeout(chatAutoHideRef.current);
            }}
          >
            <div className="absolute -inset-4 bg-[#4a7fdc]/[0.05] rounded-[32px] blur-2xl pointer-events-none" />

            <div className="relative bg-[#F7F5F2] rounded-2xl border border-[#D8D4CE]/50 shadow-[0_8px_32px_rgba(0,0,0,0.06)] flex flex-col max-h-[45vh] overflow-hidden">
              <div className="flex justify-end px-2 pt-2 pb-0 shrink-0">
                <button
                  onClick={() => setChatPanelOpen(false)}
                  className="p-1 hover:bg-black/5 rounded-md text-gray-300 hover:text-gray-500 transition-colors"
                  title="Hide chat"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-3 pt-1 space-y-2.5 min-h-0">
                {activeSession!.messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`w-fit max-w-[85%] px-3 py-2 text-[13px] leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-[#E8F0FE] text-gray-700 rounded-2xl rounded-br-sm'
                          : 'bg-[#EFECE8] text-gray-600 rounded-2xl rounded-bl-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </motion.div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel toggle hint — bottom-right */}
      <AnimatePresence>
        {hasMessages && !chatPanelOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.2, delay: 0.15 }}
            onClick={() => {
              setChatPanelOpen(true);
              // Cancel any pending auto-hide
              if (chatAutoHideRef.current) clearTimeout(chatAutoHideRef.current);
            }}
            className="fixed bottom-4 right-4 z-20 p-2.5 bg-[#F7F5F2] border border-[#D8D4CE]/60 rounded-xl shadow-md shadow-black/[0.03] text-gray-400 hover:text-[#4a7fdc] hover:shadow-[#4a7fdc]/10 transition-all"
            title="Open chat"
          >
            <MessageSquare size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Welcome text ── */}
      <AnimatePresence>
        {!hasMessages && !hasCanvasElements && user && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-10 flex items-center justify-center pointer-events-none"
          >
            <div className="text-center max-w-lg px-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#DDD9D3] mb-6">
                <img
                  src="/images/outlrn-fav.png"
                  alt="Outlrn"
                  className="w-8 h-8"
                />
              </div>
              <h1 className="text-3xl font-semibold text-gray-800 mb-3 tracking-tight">
                What would you like to learn?
              </h1>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input bar — auto-hides when canvas elements exist ── */}
      {user && (
        <motion.div
          initial={false}
          animate={{
            y: showInputBar ? 0 : 120,
            opacity: showInputBar ? 1 : 0,
          }}
          transition={{ duration: 0.3, ease: [0.33, 1, 0.68, 1] }}
          className="fixed bottom-0 left-0 right-0 z-20 pb-5 pt-3 px-4 pointer-events-none"
        >
          <div className="max-w-2xl mx-auto pointer-events-auto relative">
            {/* Breathing glow behind the input */}
            <motion.div
              animate={{
                opacity: [0.4, 0.7, 0.4],
                scale: [1, 1.02, 1],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute -inset-3 rounded-3xl pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(74,127,220,0.14) 0%, rgba(74,127,220,0.04) 50%, transparent 80%)',
                filter: 'blur(12px)',
              }}
            />
            <div className="relative bg-[#F7F5F2]/95 backdrop-blur-xl rounded-2xl border border-[#bcd4fc]/40 shadow-[0_0_24px_rgba(74,127,220,0.1),0_4px_12px_rgba(0,0,0,0.04)] focus-within:border-[#bcd4fc]/70 focus-within:shadow-[0_0_32px_rgba(74,127,220,0.18),0_4px_12px_rgba(0,0,0,0.04)] transition-all duration-300">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Describe what you want to learn..."
                rows={1}
                className="w-full resize-none bg-transparent px-5 py-2.5 pr-14 text-gray-800 placeholder:text-gray-300 text-[14px] outline-none max-h-[200px] leading-relaxed"
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isStreaming}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 bg-[#4a7fdc] hover:bg-[#3d6ec5] disabled:bg-gray-100 disabled:text-gray-300 text-white rounded-lg transition-all duration-200 hover:shadow-md hover:shadow-[#4a7fdc]/20 disabled:shadow-none"
              >
                {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} strokeWidth={2.5} />}
              </button>
            </div>
            {!hasCanvasElements && (
              <p className="text-center text-[11px] text-gray-300 mt-2.5">
                Outlrn Canvas is in beta. Review important outputs.
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Not signed in prompt */}
      {!user && (
        <div className="fixed inset-0 z-10 flex items-center justify-center">
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-6 py-3 bg-[#4a7fdc] hover:bg-[#3d6ec5] text-white font-semibold rounded-xl transition-colors shadow-lg shadow-[#4a7fdc]/20"
          >
            Sign in to access Canvas
          </button>
        </div>
      )}

      {/* ══ Focus overlay — full screen card view with navigation ══ */}
      <AnimatePresence>
        {focusedElement && (
          <motion.div
            key="focus-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setFocusedElementId(null)}
            />

            {/* Close button — top right */}
            <button
              onClick={() => setFocusedElementId(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-xl bg-white/90 backdrop-blur-md border border-[#D8D4CE]/50 text-gray-400 hover:text-gray-700 hover:bg-white transition-all shadow-lg"
              title="Close (Esc)"
            >
              <X size={18} strokeWidth={2} />
            </button>

            {/* Card label — top center */}
            {focusedElement.label && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-10"
              >
                <span
                  className="text-2xl font-bold text-white/80"
                  style={{ fontFamily: 'var(--font-caveat), cursive' }}
                >
                  {focusedElement.label}
                </span>
              </motion.div>
            )}

            {/* Navigation: Previous */}
            {focusedIndex > 0 && (
              <button
                onClick={handleFocusPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-xl bg-white/90 backdrop-blur-md border border-[#D8D4CE]/50 text-gray-400 hover:text-[#4a7fdc] hover:bg-white transition-all shadow-lg group"
                title="Previous card"
              >
                <ChevronLeft size={20} strokeWidth={2} />
              </button>
            )}

            {/* Navigation: Next */}
            {focusedIndex < focusableElements.length - 1 && (
              <button
                onClick={handleFocusNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-xl bg-white/90 backdrop-blur-md border border-[#D8D4CE]/50 text-gray-400 hover:text-[#4a7fdc] hover:bg-white transition-all shadow-lg group"
                title="Next card"
              >
                <ChevronRight size={20} strokeWidth={2} />
              </button>
            )}

            {/* Card content — full screen */}
            <motion.div
              key={focusedElement.id}
              initial={{ opacity: 0, scale: 0.92, filter: 'blur(8px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.95, filter: 'blur(4px)' }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-[90vw] h-[88vh] max-w-6xl rounded-2xl overflow-hidden bg-[#F9F7F4] border border-[#DDD9D3]/60 flex flex-col"
              style={{
                boxShadow: '0 25px 80px rgba(0,0,0,0.15), 0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.5) inset',
              }}
            >
              {/* Bottom bar — counter + actions */}
              <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2.5 bg-gradient-to-t from-[#F9F7F4] via-[#F9F7F4]/95 to-transparent">
                <div />
                <span className="text-[11px] text-[#A9A49D] font-mono">
                  {focusedIndex + 1} / {focusableElements.length}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleReplay}
                    disabled={isReplaying}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#EFECE8] text-[#6B665F] hover:bg-[#E8E5DF] hover:text-[#4a7fdc] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    title="Replay this card's content"
                  >
                    <RotateCcw size={13} strokeWidth={2} className={isReplaying ? 'animate-spin' : ''} />
                    Replay
                  </button>
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#E8F0FE] text-[#4a7fdc] hover:bg-[#dce8fc] transition-all"
                    title="Re-explain this concept"
                  >
                    <Lightbulb size={13} strokeWidth={2} />
                    Re-explain
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto min-h-0 pb-12">
                {renderFocusedContent(focusedElement)}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
