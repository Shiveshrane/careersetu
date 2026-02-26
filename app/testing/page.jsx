'use client'
import React, { useEffect, useRef, useState } from 'react';
// Adjust these imports to match your actual folder structure
import { TalkingHead } from "@met4citizen/talkinghead"; 
import { KokoroAdapter } from "@/lib/modules/KokoroAdapter"; 
import './TalkingHead.css'; 

const TalkingHeadComponent = () => {
  const avatarRef = useRef(null);
  const headRef = useRef(null);
  const adapterRef = useRef(null); 
  const subtitleTimerRef = useRef(null);

  // Metrics
  const startTimeRef = useRef(0);
  const isFirstChunkRef = useRef(false);

  // UI State
  const [inputText, setInputText] = useState("Life is like a box of chocolates. You never know what you're gonna get.");
  const [selectedPerson, setSelectedPerson] = useState("julia");
  const [loadingStatus, setLoadingStatus] = useState("Initializing...");
  const [subtitles, setSubtitles] = useState("");
  const [latency, setLatency] = useState(null);

  const persons = {
    "julia": {
      avatar: { url: "https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb?morphTargets=ARKit,Oculus Visemes", body: "F", avatarMood: "neutral" },
      view: { cameraY: 0 },
      voiceId: "af_bella"
    },
    "david": {
      avatar: { url: "https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb?morphTargets=ARKit,Oculus Visemes", body: "M", avatarMood: "neutral" },
      view: { cameraY: -20 },
      voiceId: "am_fenrir"
    }
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    if (headRef.current) return;

    const init = async () => {
      try {
        // 1. Setup Avatar
        const head = new TalkingHead(avatarRef.current, {
          ttsEndpoint: "N/A",
          cameraView: "upper",
          mixerGainSpeech: 3.0, // Increase volume
          cameraRotateEnable: false
        });
        headRef.current = head;

        // 2. Setup Adapter
        adapterRef.current = new KokoroAdapter(process.env.NEXT_PUBLIC_KOKORO_BACKEND_URL || "http://127.0.0.1:8001");

        // 3. Load Person
        await loadPerson("julia");
        head.start();

      } catch (err) {
        console.error("Init failed", err);
        setLoadingStatus("Error: " + err.message);
      }
    };

    init();
    return () => { if (headRef.current) headRef.current.stop(); };
  }, []);

  const loadPerson = async (name) => {
    const head = headRef.current;
    const person = persons[name];
    if (!head) return;

    setLoadingStatus(`Loading ${name}...`);
    try {
      await head.showAvatar(person.avatar);
      head.setView(head.viewName, person.view);
      setLoadingStatus("");
    } catch (err) {
      setLoadingStatus("Error: " + err.message);
    }
  };

  // --- SUBTITLES ---
  const addSubtitle = (word) => {
    if (word) setSubtitles(prev => prev + word + " ");
    if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
    subtitleTimerRef.current = setTimeout(() => setSubtitles(""), 3000);
  };

  // --- SPEAK BUTTON ---
  const handleSpeak = async () => {
    const head = headRef.current;
    const adapter = adapterRef.current;
    const person = persons[selectedPerson];

    if (head && adapter && inputText) {
      setLoadingStatus("Speaking..."); // Disable button
      setSubtitles("");
      setLatency(null);
      
      // Metrics reset
      startTimeRef.current = performance.now();
      isFirstChunkRef.current = true;

      try {
        await adapter.streamToAvatar(
          head, 
          inputText, 
          person.voiceId,
          
          // 1. On Chunk (Latency Check)
          (index) => {
             if (isFirstChunkRef.current) {
                const lat = Math.round(performance.now() - startTimeRef.current);
                setLatency(lat);
                isFirstChunkRef.current = false;
             }
          },

          // 2. On Subtitle (Display words)
          (word) => addSubtitle(word),

          // 3. On All Finished (Reset UI)
          () => {
             console.log("✅ Avatar finished speaking.");
             setLoadingStatus(""); // Re-enable button
             setSubtitles("");
          }
        );
      } catch (e) {
        console.error("Stream error:", e);
        setLoadingStatus("Error");
      }
    }
  };

  const handlePersonChange = (e) => {
    const val = e.target.value;
    setSelectedPerson(val);
    loadPerson(val);
  };

  return (
    <div className="th-container">
      {/* 3D Viewport */}
      <div id="avatar" ref={avatarRef} className="th-avatar-viewport" />

      {/* Controls UI */}
      <div className="th-controls">
        <input 
          type="text"
          className="th-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type something..."
        />

        <select 
          className="th-select"
          value={selectedPerson}
          onChange={handlePersonChange}
          disabled={loadingStatus === "Speaking..."}
        >
          <option value="julia">Julia</option>
          <option value="david">David</option>
        </select>

        <button 
          className="th-button"
          onClick={handleSpeak}
          disabled={loadingStatus === "Speaking..." || loadingStatus.startsWith("Loading")}
        >
          {loadingStatus === "Speaking..." ? "Speaking..." : "Speak"}
        </button>
      </div>

      {/* Latency Badge */}
      {latency && (
        <div style={{
          position: 'absolute', top: '20px', left: '20px',
          background: 'rgba(0,0,0,0.6)', color: '#0f0',
          padding: '4px 8px', borderRadius: '4px', fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          Latency: {latency}ms
        </div>
      )}

      {/* Loading/Status Overlay */}
      {loadingStatus && loadingStatus !== "Speaking..." && (
        <div className="th-info">{loadingStatus}</div>
      )}

      {/* Subtitles */}
      <div className="th-subtitles">{subtitles}</div>
    </div>
  );
};

export default TalkingHeadComponent;