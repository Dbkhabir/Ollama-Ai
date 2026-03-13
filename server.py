"""
Ollama Chat App — FastAPI Backend
=================================
This server handles:
  1. Serving the static frontend files
  2. Proxying AI requests to Ollama Cloud API
  3. Streaming-compatible response handling

Environment Variables:
  - OLLAMA_KEY: Your Ollama Cloud API key
  - PORT: Server port (Railway sets this automatically)
"""

import os
import json
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

# ---------------------------------------------------------------------------
# App Initialization
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Ollama Chat App",
    description="AI Chat powered by Ollama Cloud",
    version="1.0.0",
)

# CORS — Allow all origins so the Railway public URL works without issues
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OLLAMA_API_URL = "https://ollama.com/api/chat"
OLLAMA_MODEL = "gpt-oss_claude-sonnet4.6:latest"
OLLAMA_KEY = os.environ.get("OLLAMA_KEY", "")

# ---------------------------------------------------------------------------
# API Endpoint — /ai
# ---------------------------------------------------------------------------
@app.post("/ai")
async def ai_chat(request: Request):
    """
    Accepts JSON: { "text": "<user prompt>" }
    Forwards the prompt to Ollama Cloud API and returns the AI response.
    """

    # --- Parse incoming request ---
    try:
        body = await request.json()
        user_text = body.get("text", "").strip()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"error": "অনুগ্রহ করে সঠিক JSON পাঠান। যেমন: {\"text\": \"Hello\"}"},
        )

    if not user_text:
        return JSONResponse(
            status_code=400,
            content={"error": "টেক্সট ফিল্ড খালি রাখা যাবে না।"},
        )

    # --- Check API Key ---
    if not OLLAMA_KEY:
        return JSONResponse(
            status_code=500,
            content={"error": "সার্ভারে OLLAMA_KEY সেট করা হয়নি। Railway Variables-এ সেট করুন।"},
        )

    # --- Build Ollama API payload ---
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {
                "role": "user",
                "content": user_text,
            }
        ],
        "stream": False,  # We want a single complete response
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OLLAMA_KEY}",
    }

    # --- Call Ollama Cloud API ---
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                OLLAMA_API_URL,
                json=payload,
                headers=headers,
            )

        # --- Handle non-200 responses from Ollama ---
        if response.status_code != 200:
            error_detail = response.text
            return JSONResponse(
                status_code=response.status_code,
                content={
                    "error": f"Ollama API থেকে ত্রুটি এসেছে (HTTP {response.status_code})",
                    "detail": error_detail,
                },
            )

        # --- Parse Ollama response ---
        # Ollama may return streaming-style NDJSON even with stream:false
        # Handle both single JSON and NDJSON formats
        raw_text = response.text.strip()

        ai_content = ""

        # Try parsing as single JSON first
        try:
            data = json.loads(raw_text)
            # Standard chat response format
            if "message" in data and "content" in data["message"]:
                ai_content = data["message"]["content"]
            elif "response" in data:
                ai_content = data["response"]
            else:
                ai_content = str(data)
        except json.JSONDecodeError:
            # Might be NDJSON (newline-delimited JSON) — concatenate all content
            for line in raw_text.split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                    if "message" in chunk and "content" in chunk["message"]:
                        ai_content += chunk["message"]["content"]
                    elif "response" in chunk:
                        ai_content += chunk["response"]
                except json.JSONDecodeError:
                    continue

        if not ai_content:
            ai_content = "দুঃখিত, AI থেকে কোনো উত্তর পাওয়া যায়নি।"

        return JSONResponse(
            status_code=200,
            content={
                "response": ai_content,
                "model": OLLAMA_MODEL,
            },
        )

    except httpx.TimeoutException:
        return JSONResponse(
            status_code=504,
            content={"error": "Ollama API টাইমআউট হয়ে গেছে। আবার চেষ্টা করুন।"},
        )
    except httpx.ConnectError:
        return JSONResponse(
            status_code=502,
            content={"error": "Ollama API-তে সংযোগ করা যাচ্ছে না।"},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"সার্ভারে সমস্যা হয়েছে: {str(e)}"},
        )


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------
@app.get("/health")
async def health_check():
    """Simple health check endpoint for Railway."""
    return {"status": "ok", "model": OLLAMA_MODEL}


# ---------------------------------------------------------------------------
# Serve Frontend (static files)
# ---------------------------------------------------------------------------
# Mount static directory LAST so it doesn't override API routes
STATIC_DIR = Path(__file__).parent / "static"

@app.get("/")
async def serve_index():
    """Serve the main index.html page."""
    index_path = STATIC_DIR / "index.html"
    return HTMLResponse(content=index_path.read_text(encoding="utf-8"))

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ---------------------------------------------------------------------------
# Run with Uvicorn (for local development & Railway)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=port,
        reload=False,  # Set True for local dev
        log_level="info",
    )
