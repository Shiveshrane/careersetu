# KOKORO backend (Local GPU)

Local FastAPI server for **Kokoro 82M TTS** compatible with your existing `lib/modules/KokoroAdapter.js` contract.

## Compatibility
This server exposes:
- `POST /generate_stream`
- Streams newline-delimited JSON packets:
  - `audio`: base64 PCM16 chunk (24kHz, mono)
  - `text`: segment text

So your current adapter can consume it directly with no contract change.

## 1) Setup
```powershell
cd "KOKORO backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

## 2) Run
```powershell
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

Health:
- http://127.0.0.1:8001/health

## 3) Test stream endpoint
```powershell
curl.exe -N -X POST "http://127.0.0.1:8001/generate_stream" ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"Hello from local Kokoro backend.\",\"voice\":\"af_bella\",\"speed\":1.0}"
```

You should see many JSON lines, each with `audio` + `text`.

## 4) Connect frontend
Point your adapter URL to:
- `http://127.0.0.1:8001`

(Your adapter appends `/generate_stream`.)

## Notes
- For GPU, keep `KOKORO_DEVICE=cuda` in `.env` and ensure CUDA-enabled PyTorch is installed.
- If CUDA is unavailable, set `KOKORO_DEVICE=cpu`.
