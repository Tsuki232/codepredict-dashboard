"""Telemetría real de la puerta de enlace: registra lo que pasa de verdad y NUNCA guarda claves, direcciones IP, cuerpos de petición ni textos generados."""
from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

import httpx
import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ada_gateway import gateway, motor, telemetria  # noqa: E402
from ada_gateway.tests.test_codepredict import COLS, _filas  # noqa: E402

CLAVE = "clave-secreta-de-telemetria-123"
H = {"X-API-Key": CLAVE}
IP = "203.0.113.77"             # dirección de documentación, inventada


def eventos(carpeta: Path) -> list[dict]:
    f = carpeta / "eventos.jsonl"
    return [json.loads(l) for l in f.read_text(encoding="utf-8").splitlines()] if f.exists() else []


def texto_crudo(carpeta: Path) -> str:
    return "".join(p.read_text(encoding="utf-8") for p in carpeta.glob("eventos*.jsonl"))


@pytest.fixture
def c(monkeypatch):
    monkeypatch.setenv("GATEWAY_API_KEY", CLAVE)
    gateway._hits.clear()
    return TestClient(gateway.app)


@pytest.fixture
def con_ada(c):
    motor.iniciar()
    t0 = time.time()
    while motor.estado()["fase"] == "cargando" and time.time() - t0 < 180:
        time.sleep(0.5)
    if motor.estado()["fase"] != "listo":
        pytest.skip(f"Ada no disponible en este equipo: {motor.estado()['error']}")
    return c


# ----------------------------------------------------------------------------- lo que se registra


def test_cada_peticion_deja_inicio_y_fin_con_el_resumen_de_lo_que_hizo_ada(con_ada, telemetria_aislada):
    r = con_ada.post("/v1/stats/chi_cuadrado", json={"table": [[30, 20], [10, 40]]}, headers={**H, "cf-connecting-ip": IP, "cf-ray": "abc123"})
    assert r.status_code == 200
    ev = eventos(telemetria_aislada)
    ini, fin = [e for e in ev if e["e"] == "inicio"][-1], [e for e in ev if e["e"] == "fin"][-1]
    assert ini["id"] == fin["id"] and fin["ruta"] == "/v1/stats/chi_cuadrado" and fin["cubo"] == "stats" and fin["estado"] == 200 and fin["origen"] == "tunel"
    assert len(fin["cliente"]) == 6 and fin["ms"] >= 0 and fin["t"] >= ini["t"] and ini["bytes_in"] > 0
    d = fin["d"]
    assert d["tipo"] == "chi_cuadrado" and d["verificado"] is True and d["estadistico"] == pytest.approx(50 / 3, abs=1e-4) and d["df"] == 1
    assert len(d["vias"]) >= 2 and d["discrepancia"] is not None, "queda constancia de las dos vías con las que Ada verificó"


def test_una_peticion_desde_este_pc_se_marca_local(con_ada, telemetria_aislada):
    con_ada.get("/ada/pendulum/verify", params={"theta0_deg": 90}, headers=H)
    fin = [e for e in eventos(telemetria_aislada) if e["e"] == "fin"][-1]
    assert fin["origen"] == "local" and fin["d"]["tipo"] == "pendulo" and fin["d"]["T"] == pytest.approx(2.367842, abs=1e-5) and fin["d"]["verificado"] is True


def test_los_rechazos_tambien_quedan_registrados_con_su_estado(c, telemetria_aislada):
    assert c.post("/v1/stats/bayes", json={}).status_code == 401
    assert c.post("/v1/stats/bayes", json={}, headers={"X-API-Key": "otra"}).status_code == 401
    fin = [e for e in eventos(telemetria_aislada) if e["e"] == "fin"]
    assert [e["estado"] for e in fin] == [401, 401] and all(e["ruta"] == "/v1/stats/bayes" and e["d"] == {} for e in fin)


def test_los_sondeos_de_estado_no_se_registran_y_las_rutas_raras_no_se_copian(c, telemetria_aislada):
    c.get("/health"); c.get("/ada/health")
    assert eventos(telemetria_aislada) == []
    assert c.get("/wp-admin/setup-config.php?secreto=1").status_code in (404, 405)
    ev = eventos(telemetria_aislada)
    assert {e["ruta"] for e in ev} == {"(otra)"} and "wp-admin" not in texto_crudo(telemetria_aislada) and "secreto" not in texto_crudo(telemetria_aislada)


def test_el_arranque_deja_su_marca(telemetria_aislada):
    with TestClient(gateway.app):      # ejecuta el arranque (startup)
        pass
    assert any(e["e"] == "arranque" and isinstance(e["pid"], int) for e in eventos(telemetria_aislada))


# ----------------------------------------------------------------------------- privacidad


def test_nunca_se_guarda_la_clave_ni_la_direccion_ni_el_contenido_de_la_peticion(con_ada, telemetria_aislada):
    con_ada.post("/v1/stats/dos_grupos", json={"x": [1.5, 2.5, 3.5, 4.25], "y": [9.75, 8.5, 7.125, 6.0625]}, headers={**H, "cf-connecting-ip": IP})
    con_ada.post("/v1/stats/dos_proporciones", json={"successes": [31, 11], "nobs": [57, 59]}, headers={**H, "cf-connecting-ip": IP})
    crudo = texto_crudo(telemetria_aislada)
    for prohibido in (CLAVE, IP, "X-API-Key", "9.75", "8.5", "7.125", "6.0625", "[31,11]", "[57,59]"):
        assert prohibido not in crudo, f"no debe guardarse: {prohibido}"


def test_el_codigo_de_cada_companero_es_estable_y_no_se_puede_volver_a_la_direccion(telemetria_aislada):
    a1, a2, b = telemetria.cliente(IP), telemetria.cliente(IP), telemetria.cliente("203.0.113.78")
    assert a1 == a2 and a1 != b and len(a1) == 6
    assert a1 != hashlib.sha256(IP.encode()).hexdigest()[:6], "lleva una sal que solo existe en este PC: no se resuelve con una tabla de hashes"
    assert (telemetria_aislada / ".sal").read_bytes() and len((telemetria_aislada / ".sal").read_bytes()) == 32


def test_explicar_guarda_los_tokens_pero_no_el_texto_ni_el_resultado(c, telemetria_aislada, monkeypatch):
    texto = "El texto generado por la IA que nadie más debe ver en la telemetría."
    real = httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": texto}}], "usage": {"prompt_tokens": 120, "completion_tokens": 45}})

    monkeypatch.setattr(gateway.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    r = c.post("/v1/explicar", json={"modo": "explicar", "resultado": {"test": "t de Welch", "statistic": 26.3614, "p_value": 1.57e-148}}, headers=H)
    assert r.status_code == 200
    fin = [e for e in eventos(telemetria_aislada) if e["e"] == "fin"][-1]
    assert fin["cubo"] == "explicar" and fin["d"]["tokens_entrada"] == 120 and fin["d"]["tokens_salida"] == 45 and fin["d"]["modo"] == "explicar"
    assert fin["d"]["caracteres"] == len(texto)
    crudo = texto_crudo(telemetria_aislada)
    assert "texto generado" not in crudo and "26.3614" not in crudo and "t de Welch" not in crudo


def test_la_limpieza_guarda_los_pasos_y_si_pandas_y_duckdb_coincidieron_pero_no_las_filas(con_ada, telemetria_aislada, monkeypatch, tmp_path):
    csv = tmp_path / "Unified-file.csv"
    pd.DataFrame(_filas(), columns=COLS).to_csv(csv, index=False)
    monkeypatch.setenv("CODEPREDICT_DATASET", str(csv))
    if motor.motor().codepredict is None:
        pytest.skip("El proceso de CodePredict no cargó")
    assert con_ada.post("/v1/codepredict/limpieza", json={}, headers=H).status_code == 200
    fin = [e for e in eventos(telemetria_aislada) if e["e"] == "fin"][-1]
    d = fin["d"]
    assert d["tipo"] == "limpieza" and d["filas_in"] == d["filas_out"] == 100 and d["verificado"] is True
    assert d["pasos"] and all({"id", "titulo", "antes", "despues", "verificado"} <= set(p) for p in d["pasos"])
    crudo = texto_crudo(telemetria_aislada)
    assert "f1.java" not in crudo and "t/f2" not in crudo, "se guardan conteos, nunca los nombres de los archivos"


# ----------------------------------------------------------------------------- robustez


def test_el_archivo_se_archiva_al_pasar_el_tope_y_no_crece_sin_fin(telemetria_aislada, monkeypatch):
    monkeypatch.setattr(telemetria, "MAX_BYTES", 2000)
    for i in range(200):
        telemetria.registrar({"e": "fin", "id": f"{i:06d}", "ruta": "/v1/stats/bayes", "estado": 200, "ms": 5, "d": {}})
    assert (telemetria_aislada / "eventos.1.jsonl").exists()
    assert (telemetria_aislada / "eventos.jsonl").stat().st_size < 2000 + 400


def test_si_no_se_puede_escribir_la_telemetria_el_servicio_sigue_respondiendo(con_ada, monkeypatch, tmp_path):
    bloqueo = tmp_path / "no-es-carpeta"
    bloqueo.write_text("soy un archivo")                 # no se puede crear una carpeta con ese nombre
    monkeypatch.setenv("GATEWAY_TELEMETRIA_DIR", str(bloqueo / "dentro"))
    telemetria.registrar({"e": "fin"})                   # no lanza
    r = con_ada.post("/v1/stats/chi_cuadrado", json={"table": [[30, 20], [10, 40]]}, headers=H)
    assert r.status_code == 200 and r.json()["compact"]["verified"] is True
