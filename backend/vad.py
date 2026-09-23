"""
WebRTC Voice Activity Detection (VAD) Noise Gate.
Filters background noise, typing, and silence from reaching AI models.
Includes pre-speech ring buffer and post-speech hangover window.
"""

from collections import deque
from typing import List, Tuple
import webrtcvad
from audio_utils import FRAME_SIZE_BYTES, SAMPLE_RATE, split_into_frames


class VoiceActivityDetector:
    """
    Stateful VAD processor using WebRTC VAD.
    - Aggressiveness: 0 (most permissive) to 3 (most aggressive noise filtering).
    - Pre-padding: Remembers recent frames to capture speech onsets.
    - Hangover: Extends speech state across brief pauses to prevent syllable clipping.
    """

    def __init__(
        self,
        mode: int = 2,
        sample_rate: int = SAMPLE_RATE,
        pre_padding_frames: int = 5,  # 50ms pre-buffer
        hangover_frames: int = 30,    # 300ms hangover window
    ):
        self.sample_rate = sample_rate
        self.mode = mode
        self.vad = webrtcvad.Vad(mode)
        
        self.pre_padding_frames = pre_padding_frames
        self.hangover_frames = hangover_frames
        
        # Buffers
        self.pre_buffer: deque[bytes] = deque(maxlen=pre_padding_frames)
        self.hangover_count: int = 0
        self.is_speech_active: bool = False
        self.remainder: bytes = b""

    def set_mode(self, mode: int):
        """Update VAD aggressiveness mode (0 to 3)."""
        mode = max(0, min(3, mode))
        self.mode = mode
        self.vad.set_mode(mode)

    def is_frame_speech(self, frame: bytes) -> bool:
        """Evaluate a single 10ms (320-byte) frame."""
        if len(frame) != FRAME_SIZE_BYTES:
            return False
        try:
            return self.vad.is_speech(frame, self.sample_rate)
        except Exception:
            return False

    def process_chunk(self, chunk: bytes) -> Tuple[List[bytes], bool, int]:
        """
        Processes incoming raw PCM chunk.
        Splits into 10ms frames, evaluates VAD, applies smoothing/hangover.
        
        Returns:
            frames_to_send: List of 10ms frames that qualify as speech (or within hangover window)
            current_speech_state: Boolean indicating if voice activity is currently detected
            num_speech_frames: Number of raw speech frames detected in this chunk
        """
        frames, self.remainder = split_into_frames(chunk, self.remainder)
        frames_to_send: List[bytes] = []
        raw_speech_count = 0

        for frame in frames:
            frame_is_speech = self.is_frame_speech(frame)
            if frame_is_speech:
                raw_speech_count += 1

            if frame_is_speech:
                # If transitioning from silence to speech, flush the pre-buffer
                if not self.is_speech_active:
                    frames_to_send.extend(list(self.pre_buffer))
                    self.pre_buffer.clear()
                    self.is_speech_active = True
                
                self.hangover_count = self.hangover_frames
                frames_to_send.append(frame)
            else:
                if self.is_speech_active:
                    # Within hangover window: keep sending frame to protect trailing syllables
                    if self.hangover_count > 0:
                        self.hangover_count -= 1
                        frames_to_send.append(frame)
                    else:
                        # Hangover expired: return to silent state
                        self.is_speech_active = False
                        self.pre_buffer.append(frame)
                else:
                    # In silence state: maintain pre-buffer
                    self.pre_buffer.append(frame)

        return frames_to_send, (self.is_speech_active or raw_speech_count > 0), raw_speech_count

    def reset(self):
        """Reset internal buffers and states."""
        self.pre_buffer.clear()
        self.hangover_count = 0
        self.is_speech_active = False
        self.remainder = b""
