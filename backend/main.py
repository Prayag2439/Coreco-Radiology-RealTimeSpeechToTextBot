"""
FastAPI Backend Application for Radiology STT Pipeline.
Handles client WebSockets, WebRTC VAD gating, and dual-routing to Gemini Live and OpenAI Realtime.
"""

import asyncio
import json
import logging
import os
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from audio_utils import calculate_rms
from prompts import RADIOLOGY_SYSTEM_INSTRUCTION
from services.gemini_stream import GeminiLiveStreamer
from services.mock_stream import MockStreamingClient
from services.openai_stream import OpenAIRealtimeStreamer
from vad import VoiceActivityDetector

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("main")

# Load environment variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "gemini").lower()
VAD_MODE = int(os.getenv("VAD_MODE", "2"))
VAD_HANGOVER_FRAMES = int(os.getenv("VAD_HANGOVER_FRAMES", "30"))

app = FastAPI(title="Radiology STT Pipeline Server", version="1.0.0")

# Enable CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Returns server status and available AI streaming providers."""
    # Reload keys from .env if updated at runtime
    load_dotenv(override=True)
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()

    return {
        "status": "healthy",
        "vad_mode": VAD_MODE,
        "hangover_frames": VAD_HANGOVER_FRAMES,
        "providers": {
            "gemini": {
                "available": bool(gemini_key),
                "model": "gemini-3.5-transcribe-live",
            },
            "openai": {
                "available": bool(openai_key),
                "model": "gpt-4o-realtime-preview-2024-10-01",
            },
            "mock": {
                "available": True,
                "description": "Offline simulated medical transcription",
            },
        },
        "default_model": DEFAULT_MODEL,
    }


@app.websocket("/ws/dictate")
async def websocket_dictate(websocket: WebSocket):
    """
    Main bidirectional audio streaming WebSocket endpoint.
    Receives binary 16kHz Int16 Little Endian PCM audio from React client.
    Applies WebRTC VAD noise gate.
    Streams active speech to Gemini or OpenAI Realtime, and pushes text tokens back.
    """
    await websocket.accept()
    logger.info("Client connected to /ws/dictate")

    # Reload fresh environment configuration
    load_dotenv(override=True)
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()

    # Per-connection session state
    current_model = DEFAULT_MODEL
    vad_detector = VoiceActivityDetector(
        mode=VAD_MODE,
        hangover_frames=VAD_HANGOVER_FRAMES,
    )

    ai_streamer = None
    loop = asyncio.get_running_loop()

    async def _safe_send(payload: dict):
        """Sends JSON to frontend, silently ignoring a disconnected client."""
        try:
            await websocket.send_json(payload)
        except Exception:
            pass

    def handle_text_delta(delta: str):
        """Dispatches transcription tokens back to frontend client."""
        asyncio.run_coroutine_threadsafe(
            _safe_send({
                "type": "delta",
                "text": delta,
                "model": current_model,
            }),
            loop,
        )

    def handle_transcript_update(text: str, is_final: bool):
        """Dispatches full interim/final transcription to frontend client."""
        asyncio.run_coroutine_threadsafe(
            _safe_send({
                "type": "transcript",
                "text": text,
                "is_final": is_final,
                "model": current_model,
            }),
            loop,
        )

    def handle_stream_error(error_msg: str):
        """Notifies frontend client of streaming errors."""
        asyncio.run_coroutine_threadsafe(
            _safe_send({
                "type": "error",
                "message": error_msg,
            }),
            loop,
        )

    def handle_tool_call(tool_name: str, args: dict):
        """Dispatches 3D anatomy tool call actions to frontend client."""
        logger.info("Dispatching tool_call %s: %s", tool_name, args)
        asyncio.run_coroutine_threadsafe(
            _safe_send({
                "type": "tool_call",
                "name": tool_name,
                "arguments": args,
            }),
            loop,
        )

    async def initialize_ai_streamer(model_name: str):
        """Creates and connects appropriate AI backend streamer."""
        nonlocal ai_streamer, current_model
        if ai_streamer:
            await ai_streamer.close()
            ai_streamer = None

        current_model = model_name.lower()
        logger.info("Initializing streamer for model: %s", current_model)

        if current_model == "gemini":
            if not gemini_key:
                await websocket.send_json({
                    "type": "warning",
                    "message": "GEMINI_API_KEY is not configured in backend/.env. Falling back to Mock Simulation Mode.",
                })
                current_model = "mock"
                ai_streamer = MockStreamingClient(on_text_delta=handle_text_delta)
            else:
                ai_streamer = GeminiLiveStreamer(
                    api_key=gemini_key,
                    on_text_delta=handle_text_delta,
                    on_transcript_update=handle_transcript_update,
                    on_error=handle_stream_error,
                )
        elif current_model == "openai":
            if not openai_key:
                await websocket.send_json({
                    "type": "warning",
                    "message": "OPENAI_API_KEY is not configured in backend/.env. Falling back to Mock Simulation Mode.",
                })
                current_model = "mock"
                ai_streamer = MockStreamingClient(on_text_delta=handle_text_delta)
            else:
                ai_streamer = OpenAIRealtimeStreamer(
                    api_key=openai_key,
                    on_text_delta=handle_text_delta,
                    on_tool_call=handle_tool_call,
                    on_error=handle_stream_error,
                )
        else:
            current_model = "mock"
            ai_streamer = MockStreamingClient(on_text_delta=handle_text_delta)

        try:
            await ai_streamer.connect()
            await _safe_send({
                "type": "status",
                "state": "ready",
                "model": current_model,
                "message": f"Connected to {current_model.upper()} STT engine",
            })
        except Exception as e:
            logger.error("Failed to connect AI streamer %s: %s", current_model, e)
            await _safe_send({
                "type": "error",
                "message": f"Failed to connect to {current_model}: {str(e)}. Falling back to mock engine.",
            })
            current_model = "mock"
            ai_streamer = MockStreamingClient(on_text_delta=handle_text_delta)
            await ai_streamer.connect()

    # Initialize default streamer
    await initialize_ai_streamer(current_model)

    try:
        last_speech_state: Optional[bool] = None

        while True:
            message = await websocket.receive()
            if "bytes" in message and message["bytes"]:
                audio_bytes = message["bytes"]
                rms_val = calculate_rms(audio_bytes)

                # Process audio chunk through WebRTC VAD
                speech_frames, is_speech, raw_count = vad_detector.process_chunk(audio_bytes)

                # Send VAD state update if changed or periodically
                if is_speech != last_speech_state:
                    last_speech_state = is_speech
                    await websocket.send_json({
                        "type": "vad",
                        "is_speech": is_speech,
                        "rms": round(rms_val, 4),
                        "speech_frames": raw_count,
                    })

                # Route speech frames to AI provider
                if speech_frames and ai_streamer:
                    speech_payload = b"".join(speech_frames)
                    if isinstance(ai_streamer, MockStreamingClient):
                        await ai_streamer.send_audio(speech_payload, is_speech=True)
                    else:
                        await ai_streamer.send_audio_chunk(speech_payload)

            elif "text" in message and message["text"]:
                try:
                    data = json.loads(message["text"])
                    msg_type = data.get("type", "")

                    if msg_type == "config":
                        new_model = data.get("model")
                        new_vad_mode = data.get("vad_mode")
                        if new_vad_mode is not None:
                            vad_detector.set_mode(int(new_vad_mode))
                            logger.info("Updated VAD mode to %s", new_vad_mode)
                        if new_model and new_model != current_model:
                            await initialize_ai_streamer(new_model)

                    elif msg_type == "reset":
                        vad_detector.reset()
                        await websocket.send_json({"type": "status", "state": "reset"})

                    elif msg_type == "ping":
                        await websocket.send_json({"type": "pong"})

                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        logger.info("Client disconnected from /ws/dictate")
    except Exception as e:
        logger.error("Error in websocket session: %s", e)
    finally:
        if ai_streamer:
            await ai_streamer.close()
