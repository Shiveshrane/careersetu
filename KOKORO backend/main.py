import os
import asyncio
import base64
import io
import re
from functools import lru_cache
from typing import AsyncIterator

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

load_dotenv()

SAMPLE_RATE = 24000
DEFAULT_SPLIT_PATTERN = r"(?<=[.!?])\s+"


class GenerateStreamRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    voice: str = Field(default="af_bella")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


class TTSChunk(BaseModel):
    audio: str
    text: str


class KokoroEngine:
    def __init__(self) -> None:
        requested_device = os.getenv("KOKORO_DEVICE", "cuda")
        self.device = requested_device
        self.lang_code = os.getenv("KOKORO_LANG_CODE", "a")
        self.split_pattern = os.getenv("KOKORO_SPLIT_PATTERN", DEFAULT_SPLIT_PATTERN)

        if requested_device.startswith("cuda"):
            try:
                import torch
                if not torch.cuda.is_available():
                    self.device = "cpu"
            except Exception:
                self.device = "cpu"

        self.pipeline = self._load_pipeline()

        # ── Verify GPU inference actually works (catches broken CUDA drivers) ──
        if self.device != "cpu":
            try:
                # Quick 1-word synthesis to confirm CUDA inference works
                test_gen = self.pipeline("hi", voice="af_bella", speed=1.0)
                for item in test_gen:
                    break  # first item is enough
                import logging
                logging.getLogger("kokoro").info(f"GPU inference test passed on {self.device}")
            except Exception as exc:
                import logging
                logging.getLogger("kokoro").warning(
                    f"GPU inference failed ({exc}), falling back to CPU"
                )
                self.device = "cpu"
                self.pipeline = self._load_pipeline()

    def _load_pipeline(self):
        try:
            from kokoro import KPipeline
        except Exception as exc:
            raise RuntimeError(
                "Kokoro package is not available. Install dependencies from requirements.txt first."
            ) from exc

        try:
            return KPipeline(lang_code=self.lang_code, device=self.device)
        except TypeError:
            return KPipeline(lang_code=self.lang_code)

    def _to_float_audio(self, audio) -> np.ndarray:
        if audio is None:
            return np.array([], dtype=np.float32)

        if hasattr(audio, "detach") and hasattr(audio, "cpu"):
            audio = audio.detach().cpu().numpy()

        arr = np.asarray(audio, dtype=np.float32).flatten()
        if arr.size == 0:
            return arr

        return np.clip(arr, -1.0, 1.0)

    def _float_to_pcm16_bytes(self, audio_float: np.ndarray) -> bytes:
        if audio_float.size == 0:
            return b""
        audio_int16 = (audio_float * 32767.0).astype(np.int16)
        return audio_int16.tobytes()

    def synthesize_segments(self, text: str, voice: str, speed: float):
        generator = self.pipeline(
            text,
            voice=voice,
            speed=speed,
            split_pattern=self.split_pattern,
        )

        for item in generator:
            # Kokoro returns Result objects (not plain tuples) with
            # [0] = text, [1] = phonemes, [2] = audio tensor
            try:
                if len(item) < 3:
                    continue
            except TypeError:
                continue

            segment_text = str(item[0] or "").strip()
            audio = self._to_float_audio(item[2])
            audio_bytes = self._float_to_pcm16_bytes(audio)

            if audio_bytes:
                yield segment_text, audio_bytes


@lru_cache(maxsize=1)
def get_engine() -> KokoroEngine:
    return KokoroEngine()


app = FastAPI(
    title="KOKORO 82M Local TTS",
    description="Local FastAPI streaming server for Kokoro 82M, compatible with KokoroAdapter.js",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "message": "KOKORO local backend is running",
        "sample_rate": SAMPLE_RATE,
        "stream_endpoint": "/generate_stream",
    }


@app.get("/health")
async def health():
    try:
        engine = get_engine()
        return {
            "status": "healthy",
            "device": engine.device,
            "lang_code": engine.lang_code,
            "split_pattern": engine.split_pattern,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/generate_stream")
async def generate_stream(payload: GenerateStreamRequest):
    try:
        engine = get_engine()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    async def streamer() -> AsyncIterator[bytes]:
        import logging
        logger = logging.getLogger("kokoro_stream")
        try:
            seg_count = 0
            for segment_text, audio_bytes in engine.synthesize_segments(
                text=payload.text,
                voice=payload.voice,
                speed=payload.speed,
            ):
                seg_count += 1
                safe_text = re.sub(r"\s+", " ", segment_text).strip() or payload.text[:80]
                logger.info(f"Segment {seg_count}: text='{safe_text[:60]}', audio_bytes={len(audio_bytes)}")

                # Send the FULL segment as one NDJSON packet.
                # Splitting into tiny chunks causes choppy playback
                # because TalkingHead treats each chunk as a separate
                # speech item with gaps between them.
                packet = TTSChunk(
                    audio=base64.b64encode(audio_bytes).decode("ascii"),
                    text=safe_text,
                )
                yield (packet.model_dump_json() + "\n").encode("utf-8")
                await asyncio.sleep(0)
            logger.info(f"Stream complete: {seg_count} segments emitted")
        except Exception as exc:
            logger.error(f"Synthesis error: {exc}", exc_info=True)
            raise

    return StreamingResponse(streamer(), media_type="application/x-ndjson")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8001")), reload=True)
