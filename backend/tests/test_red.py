import socket

from app.core import red


def test_ipv4_primero_reordena_sin_descartar(monkeypatch):
    v6 = (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::1", 443, 0, 0))
    v4 = (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))
    monkeypatch.setattr(red, "_original", lambda *a, **k: [v6, v4, v6])
    assert red._ipv4_primero("x", 443) == [v4, v6, v6]
