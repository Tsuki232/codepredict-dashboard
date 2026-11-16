"""Intermediario del asistente (Ada con modelo de lenguaje por túnel): se simula la puerta de enlace con un transporte falso."""
from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app.adapters.api import routes

REAL = httpx.AsyncClient   # el cliente verdadero, guardado antes de cualquier parche (varias pruebas parchean más de una vez)
URL, CLAVE = "https://ejemplo.trycloudflare.com", "clave-secreta-xyz"
RESULTADO = {"test": "t de Welch", "statistic": 26.36, "p_value": 1.57e-148}


@pytest.fixture
def client(monkeypatch):
    from app.main import app

    monkeypatch.setenv("ADA_REMOTE_URL", URL)
    monkeypatch.setenv("ADA_REMOTE_KEY", CLAVE)
    return TestClient(app)


def remoto_falso(monkeypatch, respuesta=None, error=None, capturar=None):
    real = REAL

    def handler(request: httpx.Request) -> httpx.Response:
        if error:
            raise error
        if capturar is not None:
            capturar.append(request)
        return respuesta(request) if callable(respuesta) else (respuesta or httpx.Response(200, json={"ok": True}))

    monkeypatch.setattr(routes.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


def test_sin_configurar_no_hay_asistente(monkeypatch):
    from app.main import app

    monkeypatch.delenv("ADA_REMOTE_URL", raising=False)
    monkeypatch.delenv("ADA_REMOTE_KEY", raising=False)
    c = TestClient(app)
    assert c.get("/api/assistant/status").json()["configured"] is False
    r = c.post("/api/assistant/explain", json={"resultado": RESULTADO})
    assert r.status_code == 503 and ".env" in r.json()["detail"]


def test_una_url_rara_no_se_acepta(monkeypatch):
    from app.main import app

    monkeypatch.setenv("ADA_REMOTE_URL", "file:///etc/passwd")
    monkeypatch.setenv("ADA_REMOTE_KEY", CLAVE)
    assert TestClient(app).get("/api/assistant/status").json()["configured"] is False


def test_estado_alcanzable_y_apagado(client, monkeypatch):
    remoto_falso(monkeypatch, httpx.Response(200, json={"ok": True}))
    assert client.get("/api/assistant/status").json() == {"configured": True, "reachable": True, "detail": "Listo."}
    remoto_falso(monkeypatch, error=httpx.ConnectError("apagado"))
    s = client.get("/api/assistant/status").json()
    assert s["configured"] is True and s["reachable"] is False and "apagado" in s["detail"]


def test_la_clave_viaja_al_asistente_pero_no_vuelve_al_cliente(client, monkeypatch):
    vistas: list[httpx.Request] = []
    remoto_falso(monkeypatch, httpx.Response(200, json={"texto": "Explicación.", "modelo": "ada-q", "segundos": 3.1, "cifras_no_verificadas": [], "secreto": CLAVE}), capturar=vistas)
    r = client.post("/api/assistant/explain", json={"modo": "repaso", "resultado": RESULTADO})
    assert r.status_code == 200
    assert set(r.json()) == {"texto", "modelo", "segundos", "cifras_no_verificadas"}      # nada más sale del servidor
    assert CLAVE not in r.text
    assert vistas[0].headers["x-api-key"] == CLAVE and str(vistas[0].url) == f"{URL}/v1/explicar"
    assert b'"modo":"repaso"' in vistas[0].content.replace(b" ", b"")


@pytest.mark.parametrize("estado,esperado", [(401, 502), (413, 413), (429, 429), (503, 503), (500, 502)])
def test_errores_del_asistente_se_traducen(client, monkeypatch, estado, esperado):
    remoto_falso(monkeypatch, httpx.Response(estado, json={"detail": "algo"}))
    r = client.post("/api/assistant/explain", json={"resultado": RESULTADO})
    assert r.status_code == esperado
    assert CLAVE not in r.text


def test_pc_apagado_da_un_mensaje_claro(client, monkeypatch):
    remoto_falso(monkeypatch, error=httpx.ConnectError("sin túnel"))
    r = client.post("/api/assistant/explain", json={"resultado": RESULTADO})
    assert r.status_code == 503 and "apagado" in r.json()["detail"]


def test_modo_invalido_se_rechaza_antes_de_salir(client, monkeypatch):
    vistas: list[httpx.Request] = []
    remoto_falso(monkeypatch, capturar=vistas)
    assert client.post("/api/assistant/explain", json={"modo": "chatear", "resultado": RESULTADO}).status_code == 422
    assert vistas == []
