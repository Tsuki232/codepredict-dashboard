"""Equipo SIN Ada y SIN API: el panel avisa con un código que abre el modal y, si la persona elige Python, hace todo el proceso en local.

Datos: la tabla de 100 archivos (C∩D=30, C∩¬D=20, ¬C∩D=10, ¬C∩¬D=40) con todo calculado a mano: χ² = 50/3, z = √(50/3), P(D|C) = 0.6.
"""
from __future__ import annotations

import math

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from scipy import stats

from app.core import ada_engine, ada_proceso, inference, notebook
from app.main import app
from tests.conftest import COLS, table_rows


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    csv = tmp_path / "entrada" / "Unified-file.csv"
    csv.parent.mkdir()
    pd.DataFrame(table_rows(), columns=COLS).to_csv(csv, index=False)
    monkeypatch.setenv("CODEPREDICT_DATASET", str(csv))
    monkeypatch.setenv("CODEPREDICT_WORK", str(tmp_path / "work" / "codepredict"))
    for k in ("ADA_ENGINE", "ADA_REMOTE_URL", "ADA_REMOTE_KEY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("ADA_ROOT", str(tmp_path / "aqui-no-hay-ada"))                    # este equipo no tiene Ada
    monkeypatch.setattr(ada_engine, "_state", {"phase": "idle", "error": None, "seconds": None, "mode": None, "note": None})
    monkeypatch.setattr(ada_engine, "_mods", None)
    monkeypatch.setattr(ada_engine, "_py_mods", None)
    monkeypatch.setattr(ada_engine, "_pref", {"motor": "ada"})
    inference._cached.cache_clear()
    inference._live_cached.cache_clear()
    ada_proceso.limpiar_cache()
    notebook.reset()
    return TestClient(app)


def _esperar_a_ada(c: TestClient) -> None:
    """La carga de Ada corre en un hilo; sin Ada termina enseguida en «error»."""
    import time

    ada_engine.start_loading()
    t0 = time.time()
    while ada_engine.status()["phase"] == "loading" and time.time() - t0 < 30:
        time.sleep(0.05)


def test_sin_ada_la_inferencia_responde_503_con_el_codigo_que_abre_el_modal(cliente):
    _esperar_a_ada(cliente)
    r = cliente.post("/api/inference/live", json={})
    assert r.status_code == 503 and r.json()["code"] == "ada_no_disponible" and "ADA_REMOTE_URL" in r.json()["detail"]
    for r in (cliente.get("/api/dataset/profile"), cliente.post("/api/clean/preview", json={}), cliente.post("/api/clean/apply", json={})):
        assert r.status_code == 503 and r.json()["code"] == "ada_no_disponible", "el proceso es de Ada: sin Ada avisa desde el principio, no sigue por la libre"
    cliente.post("/api/engine", json={"motor": "python"})
    assert cliente.get("/api/dataset/profile").status_code == 200 and cliente.post("/api/clean/preview", json={}).status_code == 200, "con Python elegido funciona todo"


def test_mientras_ada_carga_el_503_es_cargando_y_no_abre_el_modal(cliente, monkeypatch):
    monkeypatch.setattr(ada_engine, "_state", {"phase": "loading", "error": None, "seconds": None, "mode": None, "note": None})
    r = cliente.post("/api/inference/live", json={})
    assert r.status_code == 503 and r.json()["code"] == "ada_cargando"


def test_elegir_python_hace_todo_el_proceso_en_local_con_las_cifras_calculadas_a_mano(cliente):
    _esperar_a_ada(cliente)
    r = cliente.post("/api/engine", json={"motor": "python"})
    assert r.status_code == 200 and r.json()["motor"] == "python" and r.json()["ada"]["mode"] == "python"
    assert cliente.get("/api/health").json()["ada"]["mode"] == "python"

    d = cliente.post("/api/inference/live", json={}).json()
    assert d["meta"]["ada"]["mode"] == "python" and d["meta"]["rows"] == 100
    x, y = [20.0] * 30 + [2.0] * 10, [20.0] * 20 + [2.0] * 40
    vx, vy = 30 * 10 * 18**2 / (40 * 39), 20 * 40 * 18**2 / (60 * 59)
    se2 = vx / 40 + vy / 60
    assert d["welch"]["statistic"] == pytest.approx(7.5 / math.sqrt(se2), rel=1e-5) and d["welch"]["verified"] is True
    assert d["chi_square"]["statistic"] == pytest.approx(50 / 3, abs=1e-4) and d["chi_square"]["df"] == 1
    assert d["two_proportions"]["statistic"] == pytest.approx(math.sqrt(50 / 3), abs=1e-4)
    assert d["two_proportions"]["p_value"] == pytest.approx(2 * stats.norm.sf(math.sqrt(50 / 3)), rel=1e-4)
    assert d["bayes"]["posterior"] == pytest.approx(0.6) and d["bayes"]["verified"] is True
    assert all("Python" in " ".join(t["verification_methods"]) for t in (d["welch"], d["chi_square"], d["two_proportions"], d["bayes"])), "ningún resultado se hace pasar por Ada"
    assert d["table2x2"] == {"C_D": 30, "C_ND": 20, "NC_D": 10, "NC_ND": 40}


def test_en_python_se_puede_guardar_la_limpieza_y_la_inferencia_guardada_funciona(cliente):
    cliente.post("/api/engine", json={"motor": "python"})
    m = cliente.post("/api/clean/apply", json={}).json()
    assert m["engine"] == "python-local" and m["output"]["rows"] == 100 and "auditoría" in m["audit"]["skipped"]
    d = cliente.post("/api/inference", json={}).json()
    assert d["bayes"]["posterior"] == pytest.approx(0.6) and d["meta"]["ada"]["mode"] == "python" and d["meta"]["source"] == "guardado"


def test_volver_a_ada_se_puede_y_descarta_los_resultados_del_otro_motor(cliente):
    cliente.post("/api/engine", json={"motor": "python"})
    assert cliente.post("/api/inference/live", json={}).status_code == 200
    r = cliente.post("/api/engine", json={"motor": "ada"})
    assert r.json()["motor"] == "ada"
    _esperar_a_ada(cliente)                    # en uso real el servidor ya cargó Ada al arrancar; TestClient no ejecuta ese arranque
    again = cliente.post("/api/inference/live", json={})
    assert again.status_code == 503 and again.json()["code"] == "ada_no_disponible", "no se queda con cifras de Python guardadas en memoria"
    assert cliente.get("/api/engine").json()["motor"] == "ada"


def test_el_motor_solo_acepta_ada_o_python(cliente):
    assert cliente.post("/api/engine", json={"motor": "otro"}).status_code == 422
