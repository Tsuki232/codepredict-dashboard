"""Ada hace TODO el proceso en otro equipo: el panel (en este proceso) habla por HTTP con la puerta de enlace REAL de Ada (en un proceso aparte).

Se compara con hacer lo mismo en local (Ada en este equipo): perfil, vista previa de la limpieza, conjunto limpio guardado e inferencia deben ser iguales.
Se omite si Ada no está instalada en este equipo.
"""
from __future__ import annotations

import hashlib
import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.core import ada_engine, ada_proceso, config, inference, notebook
from app.main import app
from tests.conftest import COLS, table_rows

CLAVE = "clave-de-prueba-del-proceso-completo"
RAIZ = Path(__file__).resolve().parents[2]


def _puerto_libre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def datos(tmp_path_factory):
    d = tmp_path_factory.mktemp("proceso")
    csv = d / "entrada" / "Unified-file.csv"
    csv.parent.mkdir()
    pd.DataFrame(table_rows(), columns=COLS).to_csv(csv, index=False)
    return d, csv


@pytest.fixture(scope="module")
def puerta(datos):
    """La puerta de enlace de Ada como proceso aparte, leyendo SU copia del CSV (la misma de las pruebas)."""
    if not config.ada_present():
        pytest.skip("Ada no está en este equipo")
    d, csv = datos
    puerto = _puerto_libre()
    env = {**os.environ, "GATEWAY_API_KEY": CLAVE, "CODEPREDICT_DATASET": str(csv), "CODEPREDICT_WORK": str(d / "work-puerta"),
           "ADA_ROOT": str(config.ada_root()), "PYTHONIOENCODING": "utf-8",
           "GATEWAY_TELEMETRIA_DIR": str(d / "telemetria-puerta")}          # la puerta de prueba NO escribe en la telemetría real de este PC (la que ve el panel «Ada en vivo»)
    for k in ("ADA_REMOTE_URL", "ADA_REMOTE_KEY", "ADA_ENGINE"):
        env.pop(k, None)
    log = open(d / "puerta.log", "w", encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "ada_gateway.gateway:app", "--host", "127.0.0.1", "--port", str(puerto)], cwd=RAIZ, env=env, stdout=log, stderr=log)
    url = f"http://127.0.0.1:{puerto}"
    try:
        t0 = time.time()
        while time.time() - t0 < 240:
            if proc.poll() is not None:
                pytest.skip(f"La puerta de enlace no arrancó (ver {d / 'puerta.log'})")
            try:
                if httpx.get(f"{url}/ada/health", timeout=2).json().get("motor") == "listo":
                    if httpx.get(f"{url}/v1/codepredict/perfil", headers={"X-API-Key": CLAVE}, timeout=60).status_code == 200:
                        break
            except httpx.HTTPError:
                pass
            time.sleep(0.5)
        else:
            pytest.skip("La puerta de enlace no quedó lista a tiempo")
        yield url
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()


def _motor(monkeypatch, work: Path, csv: Path, **env) -> TestClient:
    """Deja el panel de este proceso configurado con esas variables, con el motor recargado y sin resultados en memoria."""
    for k in ("ADA_ENGINE", "ADA_REMOTE_URL", "ADA_REMOTE_KEY"):
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("CODEPREDICT_DATASET", str(csv))
    monkeypatch.setenv("CODEPREDICT_WORK", str(work))
    monkeypatch.setattr(ada_engine, "_state", {"phase": "idle", "error": None, "seconds": None, "mode": None, "note": None})
    monkeypatch.setattr(ada_engine, "_mods", None)
    monkeypatch.setattr(ada_engine, "_py_mods", None)
    monkeypatch.setattr(ada_engine, "_pref", {"motor": "ada"})
    inference._cached.cache_clear()
    inference._live_cached.cache_clear()
    ada_proceso.limpiar_cache()
    notebook.reset()
    ada_engine.start_loading()
    t0 = time.time()
    while ada_engine.status()["phase"] == "loading" and time.time() - t0 < 180:
        time.sleep(0.1)
    return TestClient(app)


def _remoto(monkeypatch, datos, puerta, work="work-panel-remoto") -> TestClient:
    d, csv = datos
    return _motor(monkeypatch, d / work, csv, ADA_ENGINE="remote", ADA_REMOTE_URL=puerta, ADA_REMOTE_KEY=CLAVE)


def _local(monkeypatch, datos, work="work-panel-local") -> TestClient:
    d, csv = datos
    return _motor(monkeypatch, d / work, csv, ADA_ENGINE="local")


def _json(o):
    return json.loads(json.dumps(o))


# ----------------------------------------------------------------------------- lo que Ada hace en otro equipo == lo que se hace en local


def test_perfil_vista_previa_e_inferencia_hechos_por_ada_remota_son_iguales_a_los_locales(monkeypatch, datos, puerta):
    c = _remoto(monkeypatch, datos, puerta)
    assert c.get("/api/health").json()["ada"]["mode"] == "remote" and ada_engine.process_remote() is True
    perfil_r, vista_r = c.get("/api/dataset/profile").json(), c.post("/api/clean/preview", json={}).json()
    vivo_r = c.post("/api/inference/live", json={"alpha": 0.05}).json()

    c = _local(monkeypatch, datos)
    assert ada_engine.process_remote() is False
    perfil_l, vista_l = c.get("/api/dataset/profile").json(), c.post("/api/clean/preview", json={}).json()
    vivo_l = c.post("/api/inference/live", json={"alpha": 0.05}).json()

    assert perfil_r["source"]["sha256"] == perfil_l["source"]["sha256"] and perfil_r["source"]["path"] == "Unified-file.csv"   # Ada no revela su estructura de carpetas
    assert perfil_r["source"]["same_as_local"] is True and perfil_r["source"]["computed_by"] == "ada-remota"
    for k in perfil_l:
        if k != "source":
            assert _json(perfil_r[k]) == _json(perfil_l[k]), f"perfil.{k}"
    assert _json(vista_r) == _json(vista_l), "la vista previa de la limpieza (pasos, verificación pandas/DuckDB, histogramas) es la misma"
    assert vista_r["verified"] is True and vista_r["rows_in"] == vista_r["rows_out"] == 100
    for k in ("groups", "table2x2", "probabilities", "welch", "welch_log", "robust", "chi_square", "two_proportions", "bayes", "independence", "hist"):
        assert _json(vivo_r[k]) == _json(vivo_l[k]), f"inferencia.{k}"
    assert vivo_r["meta"]["ada"]["mode"] == "remote" and vivo_r["meta"]["ada"]["root"] is None and "otro equipo" in vivo_r["meta"]["source"]
    assert vivo_r["bayes"]["posterior"] == pytest.approx(0.6) and vivo_r["chi_square"]["statistic"] == pytest.approx(50 / 3, abs=1e-4)


def test_el_conjunto_limpio_guardado_por_ada_remota_es_byte_a_byte_el_local(monkeypatch, datos, puerta):
    d, csv = datos
    c = _remoto(monkeypatch, datos, puerta, "work-guardado-remoto")
    m_r = c.post("/api/clean/apply", json={}).json()
    guardado = Path(m_r["output"]["path"])
    assert m_r["engine"] == "ada-remota" and m_r["input"]["same_as_local"] is True and "otro equipo" in m_r["verification"] and "Ada" in m_r["audit"]["skipped"]
    assert hashlib.sha256(guardado.read_bytes()).hexdigest() == m_r["output"]["sha256"], "lo guardado coincide con su huella"
    assert Path(m_r["output"]["path"]).parent == (d / "work-guardado-remoto").resolve(), "se guarda en la carpeta de trabajo de ESTE equipo, nunca en data/raw"
    assert c.post("/api/inference", json={}).json()["bayes"]["events"] == {"D": "bug > 0", "C": "McCC > 10"}, "el texto del evento sale igual que en local"

    c = _local(monkeypatch, datos, "work-guardado-local")
    m_l = c.post("/api/clean/apply", json={}).json()
    assert m_r["output"]["sha256"] == m_l["output"]["sha256"] and m_r["output"]["rows"] == m_l["output"]["rows"] == 100
    assert m_r["steps"] == m_l["steps"] and m_r["table2x2"] == m_l["table2x2"]
    assert m_r["rules"] == m_l["rules"] and json.dumps(m_r["rules"]) == json.dumps(m_l["rules"]), "mismas reglas y escritas igual (10 y no 10.0)"
    assert c.post("/api/inference", json={}).json()["bayes"]["events"] == {"D": "bug > 0", "C": "McCC > 10"}
    assert c.get("/api/clean/status").json()["manifest"]["engine"] == "ada-local"


def test_si_el_csv_de_ada_no_es_el_de_este_equipo_no_se_guarda_nada(monkeypatch, datos, puerta):
    d, _csv = datos
    otro = d / "otro" / "Unified-file.csv"
    otro.parent.mkdir(exist_ok=True)
    filas = table_rows()
    filas[0][4] = 99                                   # un solo valor distinto: huella SHA-256 distinta
    pd.DataFrame(filas, columns=COLS).to_csv(otro, index=False)
    c = _motor(monkeypatch, d / "work-distinto", otro, ADA_ENGINE="remote", ADA_REMOTE_URL=puerta, ADA_REMOTE_KEY=CLAVE)
    assert c.get("/api/dataset/profile").json()["source"]["same_as_local"] is False, "el perfil ya avisa que no es el mismo archivo"
    r = c.post("/api/clean/apply", json={})
    assert r.status_code == 409 and "no son el mismo archivo" in r.json()["detail"]
    assert not (d / "work-distinto" / "unified_file_limpio.csv").exists()


def test_la_inferencia_guardada_tambien_la_calcula_ada_remota(monkeypatch, datos, puerta):
    c = _remoto(monkeypatch, datos, puerta, "work-saved-remoto")
    c.post("/api/clean/apply", json={})
    d = c.post("/api/inference", json={}).json()
    assert d["meta"]["source"] == "guardado" and d["meta"]["ada"]["mode"] == "remote"
    assert d["bayes"]["posterior"] == pytest.approx(0.6) and d["welch"]["verified"] is True


# ----------------------------------------------------------------------------- cuando Ada falla: código del modal, y Python por decisión de la persona


def test_ada_apagada_o_con_clave_mala_abre_el_modal_y_no_se_filtra_la_clave(monkeypatch, datos, puerta):
    d, csv = datos
    c = _motor(monkeypatch, d / "work-caida", csv, ADA_ENGINE="remote", ADA_REMOTE_URL="http://127.0.0.1:1", ADA_REMOTE_KEY=CLAVE)
    for ruta, cuerpo in (("/api/clean/preview", {}), ("/api/inference/live", {}), ("/api/clean/apply", {})):
        r = c.post(ruta, json=cuerpo)
        assert r.status_code == 503 and r.json()["code"] == "ada_no_disponible" and "apagado" in r.json()["detail"] and CLAVE not in r.text, ruta
    assert c.get("/api/dataset/profile").status_code == 503

    c = _motor(monkeypatch, d / "work-clave", csv, ADA_ENGINE="remote", ADA_REMOTE_URL=puerta, ADA_REMOTE_KEY="clave-equivocada")
    r = c.post("/api/clean/preview", json={})
    assert r.status_code == 503 and r.json()["code"] == "ada_no_disponible" and "rechazó la clave" in r.json()["detail"] and "clave-equivocada" not in r.text


def test_con_ada_caida_la_persona_elige_python_y_las_cifras_coinciden_con_las_de_ada(monkeypatch, datos, puerta):
    d, csv = datos
    c = _remoto(monkeypatch, datos, puerta, "work-ref")
    ref = c.post("/api/inference/live", json={}).json()                         # lo que calculó Ada

    c = _motor(monkeypatch, d / "work-py", csv, ADA_ENGINE="remote", ADA_REMOTE_URL="http://127.0.0.1:1", ADA_REMOTE_KEY=CLAVE)
    assert c.post("/api/inference/live", json={}).json()["code"] == "ada_no_disponible"
    assert c.post("/api/engine", json={"motor": "python"}).json()["ada"]["mode"] == "python"
    assert ada_engine.process_remote() is False, "con Python elegido ya no se le pide nada a Ada"
    py = c.post("/api/inference/live", json={}).json()
    assert py["meta"]["ada"]["mode"] == "python" and py["meta"]["rows"] == ref["meta"]["rows"] == 100
    for k in ("welch", "welch_log", "chi_square", "two_proportions"):
        for campo in ("statistic", "df", "p_value"):
            a, b = ref[k][campo], py[k][campo]
            assert (a is None and b is None) or b == pytest.approx(a, rel=1e-9, abs=1e-12), f"{k}.{campo}"
    assert py["bayes"]["posterior"] == ref["bayes"]["posterior"] and py["table2x2"] == ref["table2x2"]
    assert c.post("/api/clean/preview", json={}).status_code == 200 and c.post("/api/clean/apply", json={}).json()["engine"] == "python-local"
