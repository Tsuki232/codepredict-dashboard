"""Rutas de cálculo de la puerta de enlace con el MOTOR REAL de Ada, contra valores calculados a mano. Se omiten si Ada no está en este equipo."""
from __future__ import annotations

import math
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ada_gateway import gateway, motor  # noqa: E402

CLAVE = "clave-de-prueba-real"


@pytest.fixture(scope="module")
def ada():
    motor.iniciar()
    t0 = time.time()
    while motor.estado()["fase"] == "cargando" and time.time() - t0 < 180:
        time.sleep(0.5)
    if motor.estado()["fase"] != "listo":
        pytest.skip(f"Ada no disponible en este equipo: {motor.estado()['error']}")


@pytest.fixture
def c(ada, monkeypatch):
    monkeypatch.setenv("GATEWAY_API_KEY", CLAVE)
    gateway._hits.clear()
    return TestClient(gateway.app)


H = {"X-API-Key": CLAVE}


def test_welch_coincide_con_la_formula_a_mano(c):
    """Grupo 1: 30 veces 20 y 10 veces 2; grupo 2: 20 veces 20 y 40 veces 2."""
    x, y = [20.0] * 30 + [2.0] * 10, [20.0] * 20 + [2.0] * 40
    mx, my = sum(x) / 40, sum(y) / 60
    vx, vy = sum((v - mx) ** 2 for v in x) / 39, sum((v - my) ** 2 for v in y) / 59
    se2 = vx / 40 + vy / 60
    t_mano = (mx - my) / math.sqrt(se2)
    df_mano = se2**2 / ((vx / 40) ** 2 / 39 + (vy / 60) ** 2 / 59)
    r = c.post("/v1/stats/dos_grupos", json={"x": x, "y": y}, headers=H)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["compact"]["statistic"] == pytest.approx(t_mano, rel=1e-5) and d["compact"]["df"] == pytest.approx(df_mano, rel=1e-5)
    assert d["compact"]["verified"] is True and "assumptions" in d["result"]


def test_chi_cuadrado_dos_proporciones_y_bayes_a_mano(c):
    """Tabla de 100 archivos: C∩D=30, C∩¬D=20, ¬C∩D=10, ¬C∩¬D=40 → χ² = 50/3, z = √(50/3), P(D|C) = 0.6."""
    chi = c.post("/v1/stats/chi_cuadrado", json={"table": [[30, 20], [10, 40]]}, headers=H).json()["compact"]
    assert chi["statistic"] == pytest.approx(50 / 3, abs=1e-4) and chi["df"] == 1 and chi["verified"] is True
    z = c.post("/v1/stats/dos_proporciones", json={"successes": [30, 10], "nobs": [50, 50]}, headers=H).json()["compact"]
    assert abs(z["statistic"]) == pytest.approx(math.sqrt(50 / 3), abs=1e-4) and z["verified"] is True
    b = c.post("/v1/stats/bayes", json={"C_D": 30, "C_ND": 20, "NC_D": 10, "NC_ND": 40}, headers=H).json()["compact"]
    assert b["posterior"] == pytest.approx(0.6) and b["counts"]["DC"] == 30 and b["counts"]["C"] == 50 and b["verified"] is True


def test_pendulo_a_90_grados_con_el_mismo_contrato_que_el_servicio_local(c):
    r = c.get("/ada/pendulum/verify", params={"theta0_deg": 90, "L": 1, "g": 9.81}, headers=H)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["verified"] is True and d["linear_period_T0_s"] == pytest.approx(2.0061, abs=1e-4)
    assert d["exact_period_elliptic_s"] == pytest.approx(2.367842, abs=1e-5) and d["period_error_pct"] == pytest.approx(15.28, abs=0.01)
    assert c.get("/ada/pendulum/verify", params={"theta0_deg": 500}, headers=H).status_code == 422


def test_todas_las_rutas_de_calculo_exigen_clave(c):
    assert c.get("/ada/pendulum/verify").status_code == 401
    for ruta, cuerpo in (("dos_grupos", {"x": [1, 2], "y": [3, 4]}), ("chi_cuadrado", {"table": [[1, 2], [3, 4]]}),
                         ("dos_proporciones", {"successes": [1, 2], "nobs": [5, 5]}), ("bayes", {"C_D": 1, "C_ND": 1, "NC_D": 1, "NC_ND": 1})):
        assert c.post(f"/v1/stats/{ruta}", json=cuerpo).status_code == 401, ruta
        assert c.post(f"/v1/stats/{ruta}", json=cuerpo, headers={"X-API-Key": "otra"}).status_code == 401, ruta
    assert c.get("/ada/health").json()["status"] == "ok"


def test_los_metodos_costosos_se_rechazan_con_muchos_datos(c):
    muchos = [float(i % 50) for i in range(gateway.MAX_N_COSTOSO + 1)]
    r = c.post("/v1/stats/dos_grupos", json={"x": muchos, "y": muchos, "method": "permutation"}, headers=H)
    assert r.status_code == 422


def test_entradas_invalidas_dan_422(c):
    assert c.post("/v1/stats/chi_cuadrado", json={"table": [[1, 2], [3]]}, headers=H).status_code == 422
    assert c.post("/v1/stats/chi_cuadrado", json={"table": [[1, -2], [3, 4]]}, headers=H).status_code == 422
    assert c.post("/v1/stats/dos_proporciones", json={"successes": [9, 1], "nobs": [5, 5]}, headers=H).status_code == 422
    assert c.post("/v1/stats/dos_grupos", json={"x": [1.0], "y": [2.0, 3.0]}, headers=H).status_code == 422


def test_el_pendulo_tiene_su_propio_limite_holgado(c, monkeypatch):
    monkeypatch.setattr(gateway, "RATE_PER_MIN", 2)
    estados = [c.get("/ada/pendulum/verify", params={"theta0_deg": 30 + i}, headers=H).status_code for i in range(6)]
    assert estados == [200] * 6
