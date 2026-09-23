"""
Unit tests for Radiology STT backend: audio processing, WebRTC VAD, and prompts.
"""

import math
import struct
import pytest
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from audio_utils import (
    FRAME_SIZE_BYTES,
    SAMPLE_RATE,
    calculate_rms,
    split_into_frames,
    validate_frame,
)
from prompts import (
    RADIOLOGY_SYSTEM_INSTRUCTION,
    get_gemini_system_instruction,
    get_openai_system_instruction,
)
from vad import VoiceActivityDetector


def generate_sine_wave(frequency: float, duration_ms: int, sample_rate: int = SAMPLE_RATE, amplitude: int = 15000) -> bytes:
    """Generates synthetic Int16 PCM mono audio."""
    num_samples = (sample_rate * duration_ms) // 1000
    pcm = bytearray()
    for i in range(num_samples):
        val = int(amplitude * math.sin(2 * math.pi * frequency * (i / sample_rate)))
        pcm.extend(struct.pack("<h", val))
    return bytes(pcm)


def generate_silence(duration_ms: int, sample_rate: int = SAMPLE_RATE) -> bytes:
    """Generates silent Int16 PCM audio."""
    num_samples = (sample_rate * duration_ms) // 1000
    return b"\x00" * (num_samples * 2)


def test_frame_constants():
    """Verify that 10ms at 16kHz Int16 corresponds exactly to 320 bytes (160 samples)."""
    assert FRAME_SIZE_BYTES == 320
    assert validate_frame(b"\x00" * 320) is True
    assert validate_frame(b"\x00" * 319) is False
    assert validate_frame(b"\x00" * 640) is False


def test_split_into_frames():
    """Verify stream chunking into exact 320-byte frames with remainder preservation."""
    # 700 bytes = 2 full 320-byte frames (640 bytes) + 60 bytes remainder
    dummy_data = b"\x01" * 700
    frames, remainder = split_into_frames(dummy_data)
    assert len(frames) == 2
    assert len(frames[0]) == 320
    assert len(frames[1]) == 320
    assert len(remainder) == 60

    # Next chunk provides 260 bytes, completing another frame exactly (60 + 260 = 320)
    second_chunk = b"\x02" * 260
    frames2, remainder2 = split_into_frames(second_chunk, remainder=remainder)
    assert len(frames2) == 1
    assert len(frames2[0]) == 320
    assert len(remainder2) == 0


def test_calculate_rms():
    """Verify RMS calculation for silence vs loud audio."""
    silence = generate_silence(10)
    assert calculate_rms(silence) == 0.0

    loud_wave = generate_sine_wave(frequency=440.0, duration_ms=10, amplitude=20000)
    rms = calculate_rms(loud_wave)
    assert 0.4 < rms < 0.65


def test_vad_silence_filtering():
    """Verify that pure silence does not pass through VAD."""
    vad = VoiceActivityDetector(mode=2, hangover_frames=5)
    silence = generate_silence(duration_ms=100)  # 10 frames of silence
    frames_to_send, is_speech, raw_speech_count = vad.process_chunk(silence)
    
    assert raw_speech_count == 0
    assert is_speech is False
    assert len(frames_to_send) == 0


def test_vad_speech_detection_and_hangover():
    """Verify that speech-frequency audio activates VAD and respects the hangover window."""
    vad = VoiceActivityDetector(mode=1, pre_padding_frames=3, hangover_frames=5)
    
    # 300Hz tone resembles human vocal pitch
    speech_audio = generate_sine_wave(frequency=300.0, duration_ms=100, amplitude=25000)
    frames_to_send, is_speech, raw_speech_count = vad.process_chunk(speech_audio)
    
    assert is_speech is True
    assert len(frames_to_send) > 0

    # Follow with 20ms silence: hangover should keep speech active
    brief_silence = generate_silence(duration_ms=20)
    frames_hangover, hangover_is_speech, _ = vad.process_chunk(brief_silence)
    assert hangover_is_speech is True
    assert len(frames_hangover) == 2  # 2 frames forwarded via hangover


def test_prompts_integrity():
    """Verify radiology system instructions contain essential medical constraints and vocabulary."""
    instruction = RADIOLOGY_SYSTEM_INSTRUCTION
    assert "expert real-time medical transcription engine" in instruction
    assert "period" in instruction
    assert "next line" in instruction
    assert "new paragraph" in instruction
    assert "Concha bullosa" in instruction
    assert "bilateral inferior turbinates" in instruction
    assert get_gemini_system_instruction() == instruction
    assert get_openai_system_instruction() == instruction
