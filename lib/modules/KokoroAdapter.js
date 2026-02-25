/**
 * Adapter to connect Python Kokoro TTS with the TalkingHead Avatar.
 * Uses "Native Mode" to let the Avatar calculate its own high-quality lip-sync.
 */
export class KokoroAdapter {
    constructor(serverUrl = "http://127.0.0.1:8001") {
        this.serverUrl = serverUrl;
        // Padding prevents the mouth from moving during the tiny silence 
        // that often occurs at the start/end of an audio file.
        this.TIMING_PADDING_MS = 50; 
    }

    /**
     * Returns true if TalkingHead has a loaded 3D armature (avatar model).
     * speakAudio/startSpeaking are no-ops without it.
     */
    _hasArmature(head) {
        return !!(head && head.armature);
    }

    /**
     * Streams audio to the avatar (or directly via Web Audio if headless).
     * @param {Object} head - The TalkingHead instance
     * @param {string} text - The text to speak
     * @param {string} voice - Voice ID (e.g., 'af_bella')
     * @param {function} onChunk - Callback when a chunk is downloaded (for latency check)
     * @param {function} onSubtitle - Callback when a word is spoken
     * @param {function} onAllFinished - Callback when the avatar finishes speaking EVERYTHING
     */
    async streamToAvatar(head, text, voice = "af_bella", onChunk, onSubtitle, onAllFinished) {
        const hasArmature = this._hasArmature(head);
        console.log(`🚀 Requesting Audio... (mode: ${hasArmature ? 'avatar' : 'headless-direct'})`);

        // 1. Resume Audio Context and WAIT until it's actually running.
        // TalkingHead's playAudio() has a 1-second timeout — if audioCtx is still
        // 'suspended' when speakAudio is called, the audio is silently dropped.
        if (head.audioCtx) {
            if (head.audioCtx.state === 'suspended') {
                try { await head.audioCtx.resume(); } catch(e) { console.warn('[KokoroAdapter] audioCtx resume failed', e); }
            }
            // Double-check it's actually running
            if (head.audioCtx.state !== 'running') {
                console.warn('[KokoroAdapter] audioCtx state after resume:', head.audioCtx.state);
            }
        }

        const response = await fetch(`${this.serverUrl}/generate_stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voice, speed: 1.0 }),
        });

        if (!response.ok) {
            throw new Error(`Kokoro server error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let chunkIndex = 0;

        if (hasArmature) {
            // ── AVATAR MODE: queue chunks into TalkingHead's speech pipeline ──
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const packet = JSON.parse(line);
                        chunkIndex++;
                        if (onChunk) onChunk(chunkIndex);
                        this.handoffToAvatar(head, packet, onSubtitle);
                    } catch (e) {
                        console.error("[KokoroAdapter] JSON parse error", e);
                    }
                }
            }
            // Marker fires onAllFinished after the last chunk finishes playing
            if (onAllFinished) {
                head.speakMarker(onAllFinished);
            }
        } else {
            // ── HEADLESS MODE: play chunks sequentially via raw Web Audio API ──
            const audioCtx = head.audioCtx;
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const packet = JSON.parse(line);
                        if (packet.audio) {
                            chunks.push(packet);
                            chunkIndex++;
                            if (onChunk) onChunk(chunkIndex);
                        }
                    } catch (e) {
                        console.error("[KokoroAdapter] JSON parse error", e);
                    }
                }
            }

            // Play chunks sequentially
            for (const packet of chunks) {
                await this._playDirectAudio(audioCtx, packet, onSubtitle);
            }

            if (onAllFinished) onAllFinished();
        }
    }

    /**
     * Plays a single audio packet directly via Web Audio API (headless fallback).
     */
    _playDirectAudio(audioCtx, packet, onSubtitle) {
        return new Promise((resolve) => {
            if (!packet.audio) { resolve(); return; }
            try {
                // Decode base64 PCM-16 bytes
                const binaryString = window.atob(packet.audio);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

                const int16Data = new Int16Array(bytes.buffer);
                const float32Data = new Float32Array(int16Data.length);
                for (let i = 0; i < int16Data.length; i++) float32Data[i] = int16Data[i] / 32768.0;

                // Create and play AudioBuffer
                const audioBuffer = audioCtx.createBuffer(1, float32Data.length, 24000);
                audioBuffer.copyToChannel(float32Data, 0);

                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioCtx.destination);
                source.onended = resolve;
                source.start(0);

                // Fire subtitle word callbacks (simple per-word timing)
                if (onSubtitle && packet.text) {
                    const words = packet.text.trim().split(/\s+/);
                    const durationMs = audioBuffer.duration * 1000;
                    const msPerWord = durationMs / Math.max(words.length, 1);
                    words.forEach((word, i) => {
                        setTimeout(() => { if (onSubtitle) onSubtitle(word); }, i * msPerWord);
                    });
                }
            } catch (e) {
                console.error("[KokoroAdapter] _playDirectAudio error", e);
                resolve();
            }
        });
    }

    handoffToAvatar(head, packet, onSubtitle) {
        if (!packet.audio || !packet.text) {
            console.warn('[KokoroAdapter] handoffToAvatar skipped: audio=', !!packet.audio, 'text=', !!packet.text);
            return;
        }

        // --- A. Decode Audio ---
        const binaryString = window.atob(packet.audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
        
        const int16Data = new Int16Array(bytes.buffer);
        const float32Data = new Float32Array(int16Data.length);
        for (let i = 0; i < int16Data.length; i++) {
            float32Data[i] = int16Data[i] / 32768.0;
        }

        // Create AudioBuffer (Kokoro is 24000Hz)
        const audioBuffer = head.audioCtx.createBuffer(1, float32Data.length, 24000);
        audioBuffer.copyToChannel(float32Data, 0);

        console.log('[KokoroAdapter] AudioBuffer created:', {
            duration: audioBuffer.duration.toFixed(3) + 's',
            sampleRate: audioBuffer.sampleRate,
            samples: float32Data.length,
            textPreview: packet.text.substring(0, 60),
            headState: {
                isRunning: head.isRunning,
                isSpeaking: head.isSpeaking,
                isAudioPlaying: head.isAudioPlaying,
                speechQueueLen: head.speechQueue?.length,
                audioPlaylistLen: head.audioPlaylist?.length,
                audioCtxState: head.audioCtx?.state,
                armature: !!head.armature,
            }
        });

        // --- B. Prepare Words & Timings ---
        const rawText = packet.text.trim();
        if (!rawText) return;
        const words = rawText.split(/\s+/);
        
        let totalChars = 0;
        words.forEach(w => totalChars += w.length);

        const totalDurationMs = (audioBuffer.duration * 1000) - (this.TIMING_PADDING_MS * 2);
        const msPerChar = totalDurationMs / Math.max(totalChars, 1);

        const wtimes = [];
        const wdurations = [];
        let currentTime = this.TIMING_PADDING_MS; 

        words.forEach((word) => {
            const wordDuration = word.length * msPerChar;
            wtimes.push(currentTime);
            wdurations.push(wordDuration);
            currentTime += wordDuration;
        });

        // --- C. Hand off to Avatar ---
        head.speakAudio({
            audio: audioBuffer,
            words: words,
            wtimes: wtimes,
            wdurations: wdurations
        }, {}, onSubtitle);
    }
}