'use client'
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup, Variants } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
// import { createClient } from '@supabase/supabase-js'; 
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Mic, ChevronRight, Layout, Code2, Columns, Volume2, VolumeX, Eye, 
  Terminal, Loader2, Plus, MessageSquare, Menu, X, LogOut, User as UserIcon, 
  Play, Globe, RotateCw, Check, Share2
} from 'lucide-react';

// --- External Modules ---
import { TalkingHead } from "@met4citizen/talkinghead"; 
import { KokoroAdapter } from "../../lib/modules/KokoroAdapter.js"; 
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');

// --- TYPES ---
type LayoutMode = 'CONCEPT_MODE' | 'SPLIT_MODE' | 'FOCUS_MODE' | 'VISUAL_MODE';

interface VisualState {
  type: 'BROWSER';
  payload: { url: string; code: string; language?: string; };
}

interface Message { id: string; role: 'user' | 'assistant'; content: string; interaction_id?: string; }

// --- COMPONENTS ---

const BrowserPreview = ({ url }: { url: string }) => (
  <div className="flex flex-col h-full w-full bg-[#0a0a0a] rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
    <div className="flex items-center gap-3 px-4 py-3 bg-[#1a1a1a] border-b border-white/5">
      <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500/20" /><div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20" /></div>
      <div className="flex-1 bg-black/40 rounded-md px-3 py-1 border border-white/5 flex items-center gap-2">
        <Globe size={12} className="text-gray-500" />
        <span className="text-[10px] font-mono text-gray-400 truncate tracking-tight">{url || 'http://localhost:3000'}</span>
      </div>
      <RotateCw size={12} className="text-gray-500 hover:text-cyan-400 cursor-pointer transition-colors" />
    </div>
    <div className="flex-1 bg-white relative">
      {url ? (
        <iframe src={url} className="w-full h-full border-none" key={url} />
      ) : (
        <div className="absolute inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center font-mono text-gray-600">
           <Loader2 size={20} className="animate-spin mb-2 opacity-20" />
           <span className="text-[10px] uppercase tracking-widest">Awaiting Live Preview</span>
        </div>
      )}
    </div>
  </div>
);

const CodeViewer = ({ code, title = "Source_Code" }: { code: string, title?: string }) => (
  <div className="h-full w-full overflow-hidden bg-[#1e1e1e] rounded-3xl border border-white/10 flex flex-col shadow-2xl">
    <div className="px-4 py-3 bg-[#252526] border-b border-black/20 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]" />
        <span className="text-[10px] font-mono text-gray-400 font-bold uppercase tracking-widest">{title}</span>
      </div>
    </div>
    <div className="flex-1 overflow-auto custom-scrollbar">
      <SyntaxHighlighter 
        language="javascript" 
        style={vscDarkPlus} 
        customStyle={{ margin: 0, padding: '1.5rem', background: 'transparent', fontSize: '13px', lineHeight: '1.6' }} 
        showLineNumbers 
        wrapLines
      >
        {code || "// Initializing neural pathways..."}
      </SyntaxHighlighter>
    </div>
  </div>
);

const ImmersiveLearningPlatform = () => {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('SPLIT_MODE');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [subtitles, setSubtitles] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Histories
  const [conceptHistory] = useState([{ title: "Neural Sync", text: "System Online. I am your AI thought partner. How can we build today?" }]);
  const [codeHistory, setCodeHistory] = useState([{ code: "" }]);
  const [visualHistory, setVisualHistory] = useState<VisualState[]>([{ type: 'BROWSER', payload: { url: '', code: '' } }]);
  
  const avatarRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<any>(null);
  const adapterRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Initialize Avatar ONCE
  useEffect(() => {
    if (headRef.current) return;
    const initAvatar = async () => {
      if (!avatarRef.current) return;
      try {
        const head = new TalkingHead(avatarRef.current, { 
          ttsEndpoint: "N/A", 
          cameraView: "upper",
          mixerGainSpeech: 2
        });
        headRef.current = head;
        adapterRef.current = new KokoroAdapter(process.env.NEXT_PUBLIC_KOKORO_BACKEND_URL || "http://127.0.0.1:8001");
        
        await head.showAvatar({ url: "/avatars/david.glb", body: "F", avatarMood: "neutral" });
        head.start();
      } catch (err) { console.error("Avatar init failed", err); }
    };
    initAvatar();
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, subtitles]);

  const handleSendMessage = async () => {
    if (!input.trim() || isProcessing) return;
    const userMsg = input;
    setInput('');
    setIsProcessing(true);
    
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);

    try {
      const response = await fetch('http://localhost:8000/api/chat', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      });
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.replace('data: ', ''));
              
              if (data.type === 'code') setCodeHistory([{ code: data.content }]);
              if (data.type === 'visual') setVisualHistory([data.state]);
              if (data.type === 'layout') setLayoutMode(data.mode);
              
              if (data.type === 'speak') {
                // Update text UI
                setMessages(prev => {
                  const last = prev[prev.length-1];
                  if (last?.role === 'assistant') return [...prev.slice(0,-1), { ...last, content: last.content + " " + data.text }];
                  return [...prev, { id: 'asst', role: 'assistant', content: data.text }];
                });

                // Drive Lips & Audio
                if (adapterRef.current && headRef.current) {
                  adapterRef.current.streamToAvatar(
                    headRef.current,
                    data.text,
                    "am_fenrir",
                    null,
                    (word: string) => setSubtitles(prev => prev.length > 50 ? word : prev + " " + word),
                    () => setSubtitles("")
                  );
                }
              }
            } catch(e) {}
          }
        }
      }
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  return (
    <div className="flex h-screen w-full bg-[#050505] text-gray-300 font-sans overflow-hidden">
      
      {/* --- SIDEBAR: ONE AVATAR ONLY --- */}
      <motion.div 
        animate={{ width: isSidebarOpen ? 380 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="flex flex-col border-r border-white/5 bg-[#080808] z-50 overflow-hidden relative"
      >
        <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between bg-[#080808]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-mono tracking-[0.3em] text-gray-500 uppercase">Neural_Link</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-white/5 rounded text-gray-600"><X size={16}/></button>
        </div>

        {/* The 3D Stage */}
        <div className="h-[320px] bg-gradient-to-b from-black/40 to-[#080808] relative border-b border-white/5 overflow-hidden">
          <div ref={avatarRef} className="w-full h-full relative z-10" />
          <AnimatePresence>
            {subtitles && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute bottom-6 inset-x-6 z-20 text-center"
              >
                <span className="bg-black/80 backdrop-blur-md border border-white/10 px-4 py-2 rounded-2xl text-xs text-cyan-50 shadow-2xl inline-block">
                  {subtitles}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Chat Log */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar scroll-smooth">
          {messages.map(m => (
            <div key={m.id} className={cn("flex flex-col", m.role === 'user' ? "items-end" : "items-start")}>
              <div className={cn(
                "max-w-[90%] p-4 rounded-2xl text-sm border shadow-sm",
                m.role === 'user' ? "bg-cyan-950/20 border-cyan-500/20 text-cyan-50" : "bg-[#111] border-white/5 text-gray-300"
              )}>
                {m.content}
              </div>
            </div>
          ))}
          <div ref={transcriptEndRef} className="h-4" />
        </div>
      </motion.div>

      {/* --- MAIN STAGE --- */}
      <div className="flex-1 flex flex-col relative bg-[#050505]">
        
        <header className="h-16 px-8 border-b border-white/5 bg-[#080808]/50 backdrop-blur flex items-center justify-between z-40">
          <div className="flex items-center gap-4">
             {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-white/5 rounded-lg text-gray-400 hover:text-white"><Menu size={18}/></button>}
             <div className="flex gap-1 bg-[#111] p-1 rounded-xl border border-white/5">
              {[
                { id: 'CONCEPT_MODE', icon: Layout, label: 'Concept' },
                { id: 'SPLIT_MODE', icon: Columns, label: 'Split' },
                { id: 'FOCUS_MODE', icon: Code2, label: 'Code' },
                { id: 'VISUAL_MODE', icon: Eye, label: 'Visual' }
              ].map(m => (
                <button 
                  key={m.id} 
                  onClick={() => setLayoutMode(m.id as LayoutMode)} 
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-all", 
                    layoutMode === m.id ? "bg-[#222] text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
                  )}
                >
                  <m.icon size={14} /> {m.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-hidden">
          <AnimatePresence mode="wait">
            
            {/* CONCEPT: Theory focus */}
            {layoutMode === 'CONCEPT_MODE' && (
              <motion.div key="concept" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="h-full bg-[#0e0e0e] rounded-[2.5rem] p-16 border border-white/5 overflow-y-auto custom-scrollbar relative">
                <div className="max-w-3xl mx-auto">
                  <h1 className="text-6xl font-light text-white mb-10 tracking-tight">{conceptHistory[0].title}</h1>
                  <div className="text-xl text-gray-400 border-l-2 border-cyan-500/30 pl-8 tracking-wide leading-relaxed markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{conceptHistory[0].text}</ReactMarkdown>
                  </div>
                </div>
              </motion.div>
            )}

            {/* SPLIT: Code on Left, Browser on Right */}
            {layoutMode === 'SPLIT_MODE' && (
              <motion.div key="split" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex gap-8">
                <div className="flex-1 min-w-0"><CodeViewer code={codeHistory[0].code} /></div>
                <div className="flex-1 min-w-0"><BrowserPreview url={visualHistory[0].payload.url} /></div>
              </motion.div>
            )}

            {/* FOCUS: Full Code */}
            {layoutMode === 'FOCUS_MODE' && (
              <motion.div key="focus" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full">
                <CodeViewer code={codeHistory[0].code} title="Full_Focus_Editor" />
              </motion.div>
            )}

            {/* VISUAL: Full Browser */}
            {layoutMode === 'VISUAL_MODE' && (
              <motion.div key="visual" initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} className="h-full">
                <BrowserPreview url={visualHistory[0].payload.url} />
              </motion.div>
            )}

          </AnimatePresence>
        </main>

        {/* Input Bar */}
        <div className="absolute bottom-10 left-0 right-0 flex justify-center px-8 z-50">
          <div className="w-full max-w-3xl bg-[#121212]/80 backdrop-blur-2xl border border-white/10 rounded-full p-2.5 pl-8 flex items-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] group focus-within:border-cyan-500/50 transition-all">
            <Mic size={20} className={cn("mr-4 transition-colors", isProcessing ? "text-cyan-400 animate-pulse" : "text-gray-600")} />
            <input 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()} 
              className="bg-transparent flex-1 outline-none text-sm text-white placeholder-gray-600 font-light" 
              placeholder={isProcessing ? "Processing neural input..." : "Collaborate with the AI tutor..."}
              disabled={isProcessing}
            />
            <button 
              onClick={handleSendMessage} 
              disabled={!input.trim() || isProcessing}
              className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center hover:bg-cyan-500 hover:text-black transition-all active:scale-95 disabled:opacity-20"
            >
              {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <ChevronRight size={22} />}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ImmersiveLearningPlatform;