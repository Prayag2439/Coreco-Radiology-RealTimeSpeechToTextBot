"""
Gemini Multimodal Live API Streaming Service.
Establishes bidirectional WebSocket stream to Gemini Live (models/gemini-3.5-transcribe-live).
Transcribes real-time speech input with automatic medical spoken punctuation formatting.
"""

import asyncio
import base64
import json
import logging
import re
from typing import Callable, Optional
import websockets
from prompts import get_gemini_system_instruction

logger = logging.getLogger("gemini_stream")

GEMINI_LIVE_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)


def format_spoken_punctuation(text: str) -> str:
    """Converts spoken radiology punctuation commands to symbols."""
    if not text:
        return ""
    patterns = [
        (r'\bnew paragraph\b', '\n\n'),
        (r'\bnext line\b', '\n'),
        (r'\s*\bperiod\b', '.'),
        (r'\s*\bcomma\b', ','),
        (r'\s*\bcolon\b', ':'),
        (r'\s*\bsemicolon\b', ';'),
        (r'\s*\bhyphen\b', '-'),
        (r'\bopen parenthesis\b\s*', '('),
        (r'\s*\bclose parenthesis\b', ')'),
    ]
    for p, r in patterns:
        text = re.sub(p, r, text, flags=re.IGNORECASE)
    
    # Common radiology acoustic homophones
    homophones = [
        (r'\bDeliver demonstrates\b', 'The liver demonstrates'),
        (r'\bdeliver demonstrates\b', 'the liver demonstrates'),
        (r'\bDeliver is\b', 'The liver is'),
        (r'\bdeliver is\b', 'the liver is'),
        (r'\becho texture\b', 'echotexture'),
        (r'\bEcho texture\b', 'Echotexture'),
    ]
    for p, r in homophones:
        text = re.sub(p, r, text)

    # Capitalize after period or newline
    text = re.sub(r'(\.|\n)\s*([a-z])', lambda m: m.group(1) + ' ' + m.group(2).upper(), text)
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    return text


class GeminiLiveStreamer:
    """Manages continuous audio-in, live transcription session with Gemini Live."""

    def __init__(
        self,
        api_key: str,
        model: str = "models/gemini-3.5-transcribe-live",
        on_text_delta: Optional[Callable[[str], None]] = None,
        on_transcript_update: Optional[Callable[[str, bool], None]] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ):
        self.api_key = api_key
        self.model = model
        self.on_text_delta = on_text_delta
        self.on_transcript_update = on_transcript_update
        self.on_error = on_error
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self._receive_task: Optional[asyncio.Task] = None
        self.is_connected = False
        self._last_transcript = ""

    async def connect(self):
        """Connects to Gemini Live WebSocket and sends setup configuration."""
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is missing. Please add it to backend/.env")

        if self._receive_task and not self._receive_task.done():
            self._receive_task.cancel()
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
            self.ws = None

        url = f"{GEMINI_LIVE_URL}?key={self.api_key}"
        try:
            self.ws = await websockets.connect(url, ping_interval=20, ping_timeout=20)
            self.is_connected = True
            
            # Send session configuration for Live Transcribe
            setup_payload = {
                "setup": {
                    "model": self.model,
                    "generationConfig": {
                        "responseModalities": ["TEXT"],
                    },
                    "inputAudioTranscription": {},
                    "systemInstruction": {
                        "parts": [{"text": get_gemini_system_instruction()}]
                    },
                }
            }
            await self.ws.send(json.dumps(setup_payload))
            
            # Wait for setup confirmation
            initial_resp = await asyncio.wait_for(self.ws.recv(), timeout=10.0)
            logger.info("Gemini Live session initialized: %s", initial_resp[:80] if isinstance(initial_resp, str) else "binary")

            # Start background receive loop
            self._receive_task = asyncio.create_task(self._receive_loop())
        except Exception as e:
            self.is_connected = False
            err_msg = f"Failed to connect to Gemini Live: {str(e)}"
            logger.error(err_msg)
            if self.on_error:
                self.on_error(err_msg)
            raise

    async def send_audio_chunk(self, pcm_bytes: bytes):
        """Sends raw 16kHz Int16 Little Endian PCM chunk to Gemini."""
        if not self.is_connected or not self.ws:
            if getattr(self, "_is_connecting", False):
                return
            try:
                self._is_connecting = True
                logger.info("Reconnecting Gemini Live session...")
                await self.connect()
            except Exception as e:
                logger.warning("Error reconnecting to Gemini Live: %s", e)
                return
            finally:
                self._is_connecting = False

        b64_audio = base64.b64encode(pcm_bytes).decode("utf-8")
        payload = {
            "realtimeInput": {
                "mediaChunks": [
                    {
                        "mimeType": "audio/pcm;rate=16000",
                        "data": b64_audio,
                    }
                ]
            }
        }
        try:
            await self.ws.send(json.dumps(payload))
        except Exception as e:
            logger.warning("Error sending audio chunk to Gemini: %s", e)
            if self.on_error:
                self.on_error(f"Gemini audio streaming error: {str(e)}")

    async def _receive_loop(self):
        """Background task processing streaming transcription responses from Gemini."""
        try:
            while self.is_connected and self.ws:
                message = await self.ws.recv()
                data = json.loads(message)
                server_content = data.get("serverContent", {})

                # 1. Check for real-time live input transcription
                if "inputTranscription" in server_content and "text" in server_content["inputTranscription"]:
                    raw_text = server_content["inputTranscription"]["text"]
                    clean_text = format_spoken_punctuation(raw_text)
                    self._last_transcript = ""
                    if self.on_transcript_update:
                        self.on_transcript_update(clean_text, True)

                elif "interimInputTranscription" in server_content and "text" in server_content["interimInputTranscription"]:
                    raw_text = server_content["interimInputTranscription"]["text"]
                    clean_text = format_spoken_punctuation(raw_text)
                    self._last_transcript = clean_text
                    if self.on_transcript_update:
                        self.on_transcript_update(clean_text, False)

                elif server_content.get("modelTurn"):
                    # Check for standard model turn parts if interim transcription not provided
                    model_turn = server_content.get("modelTurn", {})
                    parts = model_turn.get("parts", [])
                    for part in parts:
                        text_delta = part.get("text", "")
                        if text_delta:
                            formatted_delta = format_spoken_punctuation(text_delta)
                            self._last_transcript += formatted_delta
                            if self.on_transcript_update:
                                self.on_transcript_update(self._last_transcript, False)

                # 3. Check for turn completion / end of utterance
                if server_content.get("turnComplete") or server_content.get("speechState") == "NOT_SPEECH":
                    if self._last_transcript and self.on_transcript_update:
                        self.on_transcript_update(self._last_transcript, True)
                    self._last_transcript = ""

        except asyncio.CancelledError:
            pass
        except Exception as e:
            err_str = str(e)
            if "1008" in err_str or "aborted" in err_str.lower():
                logger.info("Gemini Live session closed due to idle timeout (will reconnect on next speech)")
            else:
                logger.warning("Gemini Live receive loop ended: %s", e)
                if self.on_error:
                    self.on_error(f"Gemini streaming disconnected: {str(e)}")
        finally:
            self.is_connected = False

    async def close(self):
        """Closes connection gracefully."""
        self.is_connected = False
        if self._receive_task and not self._receive_task.done():
            self._receive_task.cancel()
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
        self.ws = None
        self._last_transcript = ""
