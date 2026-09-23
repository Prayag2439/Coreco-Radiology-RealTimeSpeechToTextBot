"""
Integration tests for FastAPI WebSocket dictation endpoint.
Tests end-to-end WebSocket connection, VAD gating, and mock streaming dispatch.
"""

import sys
import os
import pytest
from starlette.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from test_backend import generate_sine_wave, generate_silence


def test_health_endpoint():
    """Verify /health returns provider statuses and VAD configuration."""
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "providers" in data
    assert "gemini" in data["providers"]
    assert "openai" in data["providers"]
    assert "mock" in data["providers"]
    assert data["providers"]["mock"]["available"] is True


def test_websocket_dictate_mock_stream():
    """Verify WebSocket connection, config handshake, audio transmission, and delta reception."""
    client = TestClient(app)
    with client.websocket_connect("/ws/dictate") as websocket:
        # Initial status should arrive
        initial_msg = websocket.receive_json()
        assert initial_msg["type"] in ("status", "warning")

        # Explicitly configure mock model
        websocket.send_json({"type": "config", "model": "mock", "vad_mode": 1})
        config_ack = websocket.receive_json()
        assert config_ack["type"] == "status"
        assert config_ack["state"] == "ready"

        # Send speech tone (300Hz, 300ms = 30 frames of 320 bytes = 9600 bytes)
        speech_pcm = generate_sine_wave(frequency=300.0, duration_ms=300, amplitude=25000)
        websocket.send_bytes(speech_pcm)

        # Receive VAD updates
        vad_msg = websocket.receive_json()
        assert vad_msg["type"] == "vad"
        assert "is_speech" in vad_msg
