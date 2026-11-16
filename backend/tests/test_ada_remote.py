"""Ada REMOTA: contrato del cliente (con respuestas simuladas) y comparación con Ada LOCAL pasando por la puerta de enlace REAL."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx
import numpy as np
import pandas as pd
import pytest

from app.core import ada_engine, ada_remote
from tests.conftest import COLS, table_rows

REAL = httpx.Client                       # se guarda la clase real: las pruebas sustituyen httpx.Client por una con transporte simulado
CLAVE = "clave-secreta-de-prueba"
URL = "https://ada.ejemplo.test"


def _con_transporte(monkeypatch, handler):
    monkeypatch.setattr(ada_remote.httpx, "Client", lambda **kw: REAL(transport=httpx.MockTransport(handler), **kw))


@pytest.fixture
def remoto():
    return ada_remote.construir(URL, CLAVE, ada_engine.AdaNotReady)


# ----------------------------------------------------------------------------- contrato con respuestas simuladas


def test_envia_los_datos_con_la_clave_y_devuelve_lo_que_calculo_ada(remoto, monkeypatch):
    vistos = []

    def handler(req: httpx.Request) -> httpx.Response:
        vistos.append((req.url.path, req.headers.get("x-api-key"), json.loads(req.content)))
        return httpx.Response(200, json={"result": {"assumptions": {"n": 4}}, "compact": {"statistic": 1.5, "verified": True}})

    _con_transporte(monkeypatch, handler)
    res = remoto.inference.compare_two_groups(np.array([1.0, 2.0]), np.array([3.0, 5.0]), method="welch", alternative="greater", alpha=0.1, sensitivity=False)
    assert remoto.inference.compact_result(res) == {"statistic": 1.5, "verified": True} and res["assumptions"] == {"n": 4}
    ruta, clave, cuerpo = vistos[0]
    assert ruta == "/v1/stats/dos_grupos" and clave == CLAVE
    assert cuerpo == {"x": [1.0, 2.0], "y": [3.0, 5.0], "method": "welch", "alternative": "greater", "alpha": 0.1, "sensitivity": False}


@pytest.mark.parametrize("estado,esperado", [(401, "rechazó la clave"), (503, "503"), (429, "429")])
def test_errores_del_servidor_son_AdaNotReady_sin_filtrar_la_clave(remoto, monkeypatch, estado, esperado):
    _con_transporte(monkeypatch, lambda req: httpx.Response(estado, json={"detail": "x"}))
    with pytest.raises(ada_engine.AdaNotReady) as e:
        remoto.inference.chi_square_independence([[30, 20], [10, 40]])
    assert esperado in str(e.value) and CLAVE not in str(e.value)


def test_sin_conexion_se_dice_que_el_pc_puede_estar_apagado(remoto, monkeypatch):
    def handler(req):
        raise httpx.ConnectError("sin red", request=req)

    _con_transporte(monkeypatch, handler)
    with pytest.raises(ada_engine.AdaNotReady, match="apagado") as e:
        remoto.inference.two_proportions([30, 10], [50, 50])
    assert CLAVE not in str(e.value)


def test_datos_invalidos_son_ValueError_para_que_la_api_responda_422(remoto, monkeypatch):
    _con_transporte(monkeypatch, lambda req: httpx.Response(422, json={"detail": "tabla mal formada"}))
    with pytest.raises(ValueError, match="tabla mal formada"):
        remoto.inference.chi_square_independence([[1, 2], [3, 4]])


def test_la_auditoria_local_no_existe_en_remoto_y_el_limpiador_lo_tolera(remoto):
    with pytest.raises(ada_engine.AdaNotReady, match="auditoría"):   # workspace.apply_clean captura AdaNotReady y anota «skipped»
        remoto.assert_safe_write_path(Path("x"))


def test_bayes_remoto_cuenta_las_casillas_y_rechaza_eventos_que_la_api_no_admite(remoto, monkeypatch):
    cuerpos = []

    def handler(req):
        cuerpos.append(json.loads(req.content))
        return httpx.Response(200, json={"result": None, "compact": {"posterior": 0.6}})

    _con_transporte(monkeypatch, handler)
    df = pd.DataFrame(table_rows(), columns=COLS)
    res = remoto.probability.run_probability("bayes", df=df, A={"column": "bug", "op": ">", "value": 0}, B={"column": "McCC", "op": ">", "value": 10})
    assert cuerpos[0] == {"C_D": 30, "C_ND": 20, "NC_D": 10, "NC_ND": 40, "bug_threshold": 0.0, "mccc_threshold": 10.0}
    assert remoto.probability.compact_probability(res) == {"posterior": 0.6}
    with pytest.raises(ValueError, match="'>'"):
        remoto.probability.run_probability("bayes", df=df, A={"column": "bug", "op": "<", "value": 0}, B={"column": "McCC", "op": ">", "value": 10})
    with pytest.raises(ValueError, match="solo ofrece"):
        remoto.probability.run_probability("otra", df=df, A={"column": "bug", "op": ">", "value": 0}, B={"column": "McCC", "op": ">", "value": 10})


# ----------------------------------------------------------------------------- selección del motor


def _recargar(monkeypatch, **env):
    for k in ("ADA_ENGINE", "ADA_REMOTE_URL", "ADA_REMOTE_KEY", "ADA_ROOT"):
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(ada_engine, "_state", {"phase": "idle", "error": None, "seconds": None, "mode": None, "note": None})
    monkeypatch.setattr(ada_engine, "_mods", None)
    ada_engine._load()
    return ada_engine.status()


def test_forzado_remoto_usa_la_api_y_no_expone_la_ruta_local(monkeypatch):
    st = _recargar(monkeypatch, ADA_ENGINE="remote", ADA_REMOTE_URL=URL, ADA_REMOTE_KEY=CLAVE)
    assert st["ready"] and st["mode"] == "remote" and st["root"] is None and CLAVE not in str(st) and URL not in str(st)


def test_remoto_forzado_sin_clave_da_error_claro(monkeypatch):
    st = _recargar(monkeypatch, ADA_ENGINE="remote")
    assert st["phase"] == "error" and "ADA_REMOTE_URL" in st["error"]


def test_si_ada_no_esta_en_este_equipo_y_hay_api_configurada_se_usa_la_api(monkeypatch, tmp_path):
    st = _recargar(monkeypatch, ADA_ROOT=str(tmp_path / "no-existe"), ADA_REMOTE_URL=URL, ADA_REMOTE_KEY=CLAVE)
    assert st["ready"] and st["mode"] == "remote"


def test_si_ada_no_esta_y_no_hay_api_el_error_orienta(monkeypatch, tmp_path):
    st = _recargar(monkeypatch, ADA_ROOT=str(tmp_path / "no-existe"))
    assert st["phase"] == "error" and "ADA_REMOTE_URL" in st["error"]


# ----------------------------------------------------------------------------- Ada remota == Ada local (por la puerta de enlace real)


@pytest.fixture(scope="module")
def local():
    ada_engine.start_loading()
    t0 = time.time()
    while ada_engine.status()["phase"] == "loading" and time.time() - t0 < 180:
        time.sleep(0.5)
    st = ada_engine.status()
    if not st["ready"] or st["mode"] != "local":
        pytest.skip(f"Ada local no disponible para comparar: {st}")
    return ada_engine.require()


@pytest.fixture
def por_la_puerta_real(local, monkeypatch):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from fastapi.testclient import TestClient

    from ada_gateway import gateway, motor

    motor.iniciar()
    t0 = time.time()
    while motor.estado()["fase"] == "cargando" and time.time() - t0 < 180:
        time.sleep(0.5)
    if motor.estado()["fase"] != "listo":
        pytest.skip("El motor de la puerta de enlace no cargó")
    monkeypatch.setenv("GATEWAY_API_KEY", CLAVE)
    gateway._hits.clear()
    tc = TestClient(gateway.app)

    def handler(req: httpx.Request) -> httpx.Response:
        r = tc.request(req.method, req.url.path, content=req.content, headers={"x-api-key": req.headers.get("x-api-key", ""), "content-type": "application/json"})
        return httpx.Response(r.status_code, content=r.content, headers={"content-type": "application/json"})

    _con_transporte(monkeypatch, handler)
    return gateway._json


def test_la_api_de_ada_da_exactamente_lo_mismo_que_ada_local(local, por_la_puerta_real, remoto):
    norm = por_la_puerta_real                                                   # mismo conversor de numpy→JSON que usa la API
    rng = np.random.default_rng(7)
    x, y = rng.lognormal(2.3, 0.9, 400), rng.lognormal(1.9, 0.9, 700)
    for alt in ("two-sided", "greater"):
        a = local.inference.compare_two_groups(x, y, method="welch", alpha=0.05, sensitivity=False, alternative=alt)
        b = remoto.inference.compare_two_groups(x, y, method="welch", alpha=0.05, sensitivity=False, alternative=alt)
        assert norm(local.inference.compact_result(a)) == remoto.inference.compact_result(b)
        assert norm(a.get("assumptions")) == b.get("assumptions") and norm(a.get("discrepancy")) == b.get("discrepancy")
    tabla = [[30, 20], [10, 40]]
    assert norm(local.inference.compact_result(local.inference.chi_square_independence(tabla, alpha=0.05))) == \
        remoto.inference.compact_result(remoto.inference.chi_square_independence(tabla, alpha=0.05))
    assert norm(local.inference.compact_result(local.inference.two_proportions([30, 10], [50, 50], alpha=0.05))) == \
        remoto.inference.compact_result(remoto.inference.two_proportions([30, 10], [50, 50], alpha=0.05))
    df = pd.DataFrame(table_rows(), columns=COLS)
    A, B = {"column": "bug", "op": ">", "value": 0}, {"column": "McCC", "op": ">", "value": 10}
    assert norm(local.probability.compact_probability(local.probability.run_probability("bayes", df=df, A=A, B=B))) == \
        remoto.probability.compact_probability(remoto.probability.run_probability("bayes", df=df, A=A, B=B))


def test_ADA_ENGINE_vacio_o_mal_escrito_se_comporta_como_auto(monkeypatch, tmp_path):
    """.env.example trae `ADA_ENGINE=` vacía: no debe quitar el respaldo remoto."""
    for valor in ("", "  ", "remoto?"):
        st = _recargar(monkeypatch, ADA_ENGINE=valor, ADA_ROOT=str(tmp_path / "no-existe"), ADA_REMOTE_URL=URL, ADA_REMOTE_KEY=CLAVE)
        assert st["ready"] and st["mode"] == "remote", valor
