"""Rutas del proceso completo de CodePredict en la puerta de enlace (/v1/codepredict/*), con el motor REAL de Ada y un CSV pequeño. Se omiten si Ada no está."""
from __future__ import annotations

import base64
import gzip
import hashlib
import io
import sys
import time
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ada_gateway import gateway, motor  # noqa: E402

CLAVE = "clave-de-prueba-codepredict"
H = {"X-API-Key": CLAVE}
COLS = ["ID", "Name", "LongName", "Parent", "McCC", "CLOC", "PDA", "PUA", "LLOC", "LOC", "bug"]


def _filas() -> list[list]:
    """Tabla de 100 archivos: C∩D=30, C∩¬D=20, ¬C∩D=10, ¬C∩¬D=40 (McCC 20 si es compleja, 2 si no)."""
    out, k = [], 0
    for n, mccc, bug in ((30, 20, 1), (20, 20, 0), (10, 2, 1), (40, 2, 0)):
        for _ in range(n):
            k += 1
            out.append([f"T{k}", f"f{k}.java", f"t/f{k}.java", "P", mccc, 0, 0, 0, 5, 8, bug])
    return out


@pytest.fixture(scope="module")
def csv(tmp_path_factory):
    p = tmp_path_factory.mktemp("cp") / "Unified-file.csv"
    pd.DataFrame(_filas(), columns=COLS).to_csv(p, index=False)
    return p


@pytest.fixture
def c(csv, monkeypatch):
    monkeypatch.setenv("CODEPREDICT_DATASET", str(csv))
    monkeypatch.setenv("GATEWAY_API_KEY", CLAVE)
    motor.iniciar()
    t0 = time.time()
    while motor.estado()["fase"] == "cargando" and time.time() - t0 < 180:
        time.sleep(0.5)
    if motor.estado()["fase"] != "listo":
        pytest.skip(f"Ada no disponible en este equipo: {motor.estado()['error']}")
    if motor.motor().codepredict is None:
        pytest.skip(f"El proceso de CodePredict no cargó: {motor.motor().codepredict_error}")
    gateway._hits.clear()
    return TestClient(gateway.app)


RUTAS = (("get", "/v1/codepredict/perfil", None), ("post", "/v1/codepredict/limpieza", {}), ("post", "/v1/codepredict/inferencia", {"rules": {}}),
         ("post", "/v1/codepredict/limpio", {}))


@pytest.mark.parametrize("metodo,ruta,cuerpo", RUTAS)
def test_todas_las_rutas_del_proceso_exigen_clave(c, metodo, ruta, cuerpo):
    for cab in ({}, {"X-API-Key": "otra"}):
        r = c.request(metodo, ruta, json=cuerpo, headers=cab)
        assert r.status_code == 401, (ruta, cab)


def test_perfil_no_revela_la_estructura_de_carpetas_de_este_equipo(c, csv):
    r = c.get("/v1/codepredict/perfil", headers=H)
    assert r.status_code == 200 and r.json()["source"]["path"] == "Unified-file.csv"
    assert str(csv.parent) not in r.text and "\\" not in r.json()["source"]["path"]


def test_vista_e_inferencia_traen_los_valores_calculados_a_mano(c):
    v = c.post("/v1/codepredict/limpieza", json={}, headers=H).json()
    assert v["verified"] is True and v["rows_in"] == v["rows_out"] == 100 and v["table2x2"] == {"C_D": 30, "C_ND": 20, "NC_D": 10, "NC_ND": 40}
    i = c.post("/v1/codepredict/inferencia", json={"rules": {}, "alpha": 0.05}, headers=H).json()
    assert i["chi_square"]["statistic"] == pytest.approx(50 / 3, abs=1e-4) and i["bayes"]["posterior"] == pytest.approx(0.6) and i["bayes"]["verified"] is True
    assert "ada" not in i["meta"], "el estado de Ada (con rutas de este equipo) no sale por la API"


def test_el_conjunto_limpio_llega_con_su_tamano_y_huella_y_con_las_filas_de_la_vista(c):
    r = c.post("/v1/codepredict/limpio", json={}, headers=H)
    d = r.json()
    csv = gzip.decompress(base64.b64decode(d["csv_gzip_base64"]))
    assert len(csv) == d["csv_bytes"] and hashlib.sha256(csv).hexdigest() == d["csv_sha256"]
    tabla = pd.read_csv(io.BytesIO(csv))
    assert len(tabla) == d["info"]["output"]["rows"] == 100 and list(tabla.columns) == d["info"]["output"]["columns"]
    assert d["info"]["input"]["name"] == "Unified-file.csv" and "\\" not in str(d["info"]["input"]), "no se revela la ruta de este equipo"


@pytest.mark.parametrize("reglas", [{"path_policy": "otra"}, {"mccc_threshold": 1e30}, {"bug_threshold": "nan"}, {"mccc_threshold": "inf"}, {"outlier_policy": 7}])
def test_reglas_invalidas_se_rechazan_con_422(c, reglas):
    for ruta in ("/v1/codepredict/limpieza", "/v1/codepredict/limpio"):
        assert c.post(ruta, json=reglas, headers=H).status_code == 422, (ruta, reglas)
    assert c.post("/v1/codepredict/inferencia", json={"rules": reglas}, headers=H).status_code == 422
    assert c.post("/v1/codepredict/inferencia", json={"rules": {}, "alpha": 1.5}, headers=H).status_code == 422


def test_si_falta_el_csv_el_error_no_dice_donde_estaba(c, monkeypatch, tmp_path):
    monkeypatch.setenv("CODEPREDICT_DATASET", str(tmp_path / "secreto" / "no-existe.csv"))
    r = c.get("/v1/codepredict/perfil", headers=H)
    assert r.status_code == 404 and "secreto" not in r.text and "no-existe" not in r.text


def test_el_conjunto_limpio_tiene_su_propio_tope_por_minuto(c, monkeypatch):
    monkeypatch.setattr(gateway, "RATE_CP_LIMPIO", 2)
    estados = [c.post("/v1/codepredict/limpio", json={}, headers=H).status_code for _ in range(3)]
    assert estados == [200, 200, 429]
    assert c.get("/v1/codepredict/perfil", headers=H).status_code == 200, "el tope del CSV no frena el resto"
