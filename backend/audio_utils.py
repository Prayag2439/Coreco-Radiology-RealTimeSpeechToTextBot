"""
Audio utility functions for 16kHz Int16 Little Endian PCM processing.
"""

import math
import struct
from typing import List, Tuple

SAMPLE_RATE = 16000
SAMPLE_WIDTH = 2  # 16-bit Int16 = 2 bytes
FRAME_DURATION_MS = 10  # 10ms frames required by WebRTC VAD
FRAME_SIZE_SAMPLES = (SAMPLE_RATE * FRAME_DURATION_MS) // 1000  # 160 samples
FRAME_SIZE_BYTES = FRAME_SIZE_SAMPLES * SAMPLE_WIDTH  # 320 bytes


def validate_frame(frame: bytes) -> bool:
    """Validate that frame matches exactly the required WebRTC VAD frame size."""
    return len(frame) == FRAME_SIZE_BYTES


def split_into_frames(data: bytes, remainder: bytes = b"") -> Tuple[List[bytes], bytes]:
    """
    Splits arbitrary incoming byte chunks into exact 320-byte (10ms) frames.
    Returns:
        tuple (list_of_frames, remaining_bytes)
    """
    buffer = remainder + data
    num_complete_frames = len(buffer) // FRAME_SIZE_BYTES
    frames = []
    
    for i in range(num_complete_frames):
        start = i * FRAME_SIZE_BYTES
        end = start + FRAME_SIZE_BYTES
        frames.append(buffer[start:end])
        
    leftover = buffer[num_complete_frames * FRAME_SIZE_BYTES:]
    return frames, leftover


def calculate_rms(frame: bytes) -> float:
    """Calculate RMS (Root Mean Square) volume level normalized between 0.0 and 1.0."""
    if not frame or len(frame) % 2 != 0:
        return 0.0
    
    sample_count = len(frame) // 2
    if sample_count == 0:
        return 0.0
        
    # Unpack Little Endian signed 16-bit integers
    shorts = struct.unpack(f"<{sample_count}h", frame)
    sum_squares = sum(s * s for s in shorts)
    mean_square = sum_squares / sample_count
    rms = math.sqrt(mean_square)
    
    # Normalize with respect to max Int16 amplitude (32768)
    return min(rms / 32768.0, 1.0)
