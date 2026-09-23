"""
Mock Streaming Service for Offline Development & Testing.
Simulates real-time medical transcription streaming when cloud API keys are absent.
"""

import asyncio
from typing import AsyncGenerator, Callable, Optional


SAMPLE_RADIOLOGY_PHRASES = [
    "Examination: CT Chest without intravenous contrast.",
    " Clinical History: 58-year-old male with persistent dyspnea and chronic cough.",
    " Findings: The lungs demonstrate mild bilateral basal atelectasis.",
    " No focal consolidation, pneumothorax, or pleural effusion is identified.",
    " Mild mucosal thickening is noted along the nasal cavity, with bilateral inferior turbinates hypertrophy.",
    " A well-aerated left concha bullosa is visualized without fluid level.",
    " Mediastinal and hilar lymph nodes are within normal limits for size.",
    " Heart size is normal. No pericardial effusion.",
    " Visualized osseous structures show mild degenerative changes in the thoracic spine without acute fracture.",
    " Impression: 1. No acute cardiopulmonary disease.",
    " 2. Stable mild dependent atelectasis and bilateral inferior turbinates hypertrophy.",
]


class MockStreamingClient:
    """Mock real-time STT engine producing streaming radiology text deltas."""

    def __init__(self, on_text_delta: Optional[Callable[[str], None]] = None):
        self.on_text_delta = on_text_delta
        self.is_running = False
        self._phrase_idx = 0
        self._speech_frame_count = 0

    async def connect(self):
        self.is_running = True

    async def send_audio(self, pcm_data: bytes, is_speech: bool = True):
        """Called when audio frames arrive. Generates realistic streaming tokens during speech."""
        if not self.is_running or not is_speech:
            return

        self._speech_frame_count += 1
        # Stream text every ~12 frames of speech (approx 120ms)
        if self._speech_frame_count >= 12:
            self._speech_frame_count = 0
            phrase = SAMPLE_RADIOLOGY_PHRASES[self._phrase_idx % len(SAMPLE_RADIOLOGY_PHRASES)]
            self._phrase_idx += 1
            if self.on_text_delta:
                text_to_send = (" " + phrase.strip()) if not phrase.startswith(" ") else phrase
                self.on_text_delta(text_to_send)

    async def close(self):
        self.is_running = False

