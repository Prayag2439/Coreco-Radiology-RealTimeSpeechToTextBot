"""
OpenAI Realtime API Streaming Service.
Establishes bidirectional WebSocket stream to GPT-4o Realtime.
Forces text-only output modality for real-time transcription.
"""

import asyncio
import base64
import json
import logging
from typing import Callable, Optional
import websockets
from prompts import get_openai_system_instruction

logger = logging.getLogger("openai_stream")

OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01"


OPENAI_3D_ANATOMY_TOOL = {
    "type": "function",
    "name": "manipulate_3d_anatomy",
    "description": "Manipulate or highlight specific anatomical structures in the 3D viewer based on the user's radiology/anatomy query.",
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["isolate", "highlight", "xray", "dissect", "reset"],
                "description": "The action to execute in the 3D viewer.",
            },
            "objectIds": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Standard medical anatomy identifiers to target (e.g., 'middle_nasal_concha', 'inferior_nasal_concha', 'maxillary_sinus', 'ethmoidal_air_cells', 'frontal_sinus').",
            },
            "color": {
                "type": "string",
                "description": "Optional hex color string for highlighting (e.g. '#FF0000').",
            },
        },
        "required": ["action", "objectIds"],
    },
}


class OpenAIRealtimeStreamer:
    """Manages continuous audio-in, text-out session with OpenAI Realtime API."""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-realtime-preview-2024-10-01",
        on_text_delta: Optional[Callable[[str], None]] = None,
        on_tool_call: Optional[Callable[[str, dict], None]] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ):
        self.api_key = api_key
        self.model = model
        self.on_text_delta = on_text_delta
        self.on_tool_call = on_tool_call
        self.on_error = on_error
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self._receive_task: Optional[asyncio.Task] = None
        self.is_connected = False

    async def connect(self):
        """Connects to OpenAI Realtime WebSocket and configures session."""
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is missing. Please add it to backend/.env")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1",
        }
        url = f"wss://api.openai.com/v1/realtime?model={self.model}"
        try:
            self.ws = await websockets.connect(
                url,
                additional_headers=headers,
                ping_interval=20,
                ping_timeout=20,
            )
            self.is_connected = True

            # Send session configuration with 3D Anatomy tool definition
            session_config = {
                "type": "session.update",
                "session": {
                    "modalities": ["text"],
                    "instructions": (
                        get_openai_system_instruction()
                        + " In addition, whenever specific anatomical structures or pathologies are mentioned "
                        "(e.g., concha bullosa, inferior turbinates, maxillary sinuses, ethmoid air cells, frontal sinuses), "
                        "call the manipulate_3d_anatomy tool with the corresponding action ('highlight', 'isolate', or 'xray') and objectIds."
                    ),
                    "input_audio_format": "pcm16",
                    "tools": [OPENAI_3D_ANATOMY_TOOL],
                    "tool_choice": "auto",
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 400,
                    },
                    "temperature": 0.0,
                },
            }
            await self.ws.send(json.dumps(session_config))
            logger.info("OpenAI Realtime session configured with text output and 3D anatomy tool calling.")

            # Start background receive loop
            self._receive_task = asyncio.create_task(self._receive_loop())
        except Exception as e:
            self.is_connected = False
            err_msg = f"Failed to connect to OpenAI Realtime: {str(e)}"
            logger.error(err_msg)
            if self.on_error:
                self.on_error(err_msg)
            raise

    async def send_audio_chunk(self, pcm_bytes: bytes):
        """Appends audio chunk to OpenAI input buffer."""
        if not self.is_connected or not self.ws:
            return

        b64_audio = base64.b64encode(pcm_bytes).decode("utf-8")
        payload = {
            "type": "input_audio_buffer.append",
            "audio": b64_audio,
        }
        try:
            await self.ws.send(json.dumps(payload))
        except Exception as e:
            logger.warning("Error appending audio to OpenAI buffer: %s", e)
            if self.on_error:
                self.on_error(f"OpenAI audio buffer error: {str(e)}")

    async def _receive_loop(self):
        """Background task processing streaming events from OpenAI."""
        try:
            while self.is_connected and self.ws:
                message = await self.ws.recv()
                data = json.loads(message)
                event_type = data.get("type", "")

                if event_type in ("response.text.delta", "response.audio_transcript.delta"):
                    delta = data.get("delta", "")
                    if delta and self.on_text_delta:
                        self.on_text_delta(delta)

                # 3D Anatomy Tool Call / Function Call Detection
                elif event_type == "response.function_call_arguments.done":
                    func_name = data.get("name", "")
                    raw_args = data.get("arguments", "{}")
                    try:
                        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                        if self.on_tool_call:
                            self.on_tool_call(func_name, args)
                    except Exception as err:
                        logger.warning("Error parsing function call arguments: %s", err)

                elif event_type == "response.output_item.done":
                    item = data.get("item", {})
                    if item.get("type") == "function_call":
                        func_name = item.get("name", "")
                        raw_args = item.get("arguments", "{}")
                        try:
                            args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                            if self.on_tool_call:
                                self.on_tool_call(func_name, args)
                        except Exception as err:
                            logger.warning("Error parsing function call arguments: %s", err)

                elif event_type == "error":
                    error_info = data.get("error", {})
                    msg = error_info.get("message", "Unknown OpenAI Realtime error")
                    logger.error("OpenAI error event: %s", msg)
                    if self.on_error:
                        self.on_error(f"OpenAI API error: {msg}")

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning("OpenAI Realtime receive loop ended: %s", e)
            if self.on_error:
                self.on_error(f"OpenAI streaming disconnected: {str(e)}")
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
