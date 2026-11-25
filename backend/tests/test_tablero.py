"""Tablero estadístico: cada cifra se calcula a mano sobre la tabla 2×2 sintética (C∩D = 30, C∩¬D = 20, ¬C∩D = 10, ¬C∩¬D = 40; McCC 20 o 2)."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from scipy import stats

from app.core import analisis_t, tablero, tstudent
from app.main import app
from tests.conftest import COLS, table_rows


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    csv = tmp_path / "entrada" / "Unified-file.csv"
    csv.parent.mkdir()
    pd.DataFrame(table_rows(), columns=COLS).to_csv(csv, index=False)
    monkeypatch.setenv("CODEPREDICT_DATASET", str(csv))
    monkeypatch.setenv("CODEPREDICT_WORK", str(tmp_path / "work" / "codepredict"))
    monkeypatch.setenv("ADA_ROOT", str(tmp_path / "aqui-no-hay-ada"))
    for k in ("ADA_ENGINE", "ADA_REMOTE_URL", "ADA_REMOTE_KEY"):
        monkeypatch.delenv(k, raising=False)
    analisis_t.limpiar_cache()
    tablero.limpiar_cache()
    return TestClient(app)


@pytest.fixture
def datos(cliente):
    cliente.post("/api/engine", json={"motor": "python"})
    assert cliente.post("/api/clean/apply", json={}).status_code == 200
    r = cliente.get("/api/tablero")
    assert r.status_code == 200
    return r.json()


def test_sin_conjunto_limpio_pide_limpiar_primero(cliente):
    r = cliente.get("/api/tablero")
    assert r.status_code == 409 and "limpieza" in r.json()["detail"].lower()


def test_tabla_2x2_probabilidades_y_bayes_a_mano(datos):
    t = datos["tabla"]
    assert t["celdas"] == {"C_D": 30, "C_ND": 20, "NC_D": 10, "NC_ND": 40} and t["n"] == 100 and t["coincide_manifiesto"] is True
    assert (t["p_d"], t["p_c"], t["p_d_dado_c"], t["p_d_dado_nc"]) == pytest.approx((0.4, 0.5, 0.6, 0.2))
    assert t["total_probabilidad"] == pytest.approx(0.4)                                    # 0,6·0,5 + 0,2·0,5
    assert t["p_c_dado_d"] == pytest.approx(0.75) and t["p_c_dado_d_directa"] == pytest.approx(0.75) and t["bayes_coincide"] is True
    assert t["razon_de_riesgo"] == pytest.approx(3.0) and t["odds_ratio"] == pytest.approx(6.0) and t["dependientes"] is True
    se = math.sqrt(1 / 30 + 1 / 20 + 1 / 10 + 1 / 40)
    z = stats.norm.ppf(0.975)
    assert t["or_ic95"] == pytest.approx([6 * math.exp(-z * se), 6 * math.exp(z * se)], rel=1e-9)


def test_kpis_cajas_e_histograma_a_mano(datos):
    k = datos["kpis"]
    assert (k["filas"], k["con_bug"], k["complejas"]) == (100, 40, 50) and k["tasa_bug"] == pytest.approx(0.4) and k["media_mccc"] == pytest.approx(11.0)
    con, sin = datos["cajas"]["con_bug"], datos["cajas"]["sin_bug"]
    assert (con["n"], sin["n"]) == (40, 60) and con["media"] == pytest.approx(15.5) and sin["media"] == pytest.approx(8.0) and con["mediana"] == 20 and sin["mediana"] == 2
    assert con["bigote_bajo"] == 20 and con["atipicos"] == 0                                # los 2 de los archivos con bug quedan bajo el bigote
    h = {f["tramo"]: f for f in datos["histograma"]}
    assert (h["16–20"]["con_bug"], h["16–20"]["sin_bug"], h["2"]["con_bug"], h["2"]["sin_bug"]) == (30, 20, 10, 40)
    assert sum(f["con_bug"] for f in h.values()) == 40 and sum(f["sin_bug"] for f in h.values()) == 60
    assert sum(f["parte_con_bug"] for f in h.values()) == pytest.approx(1.0) and sum(f["parte_sin_bug"] for f in h.values()) == pytest.approx(1.0)


def test_riesgo_por_tramo_trae_solo_tramos_con_archivos_y_su_intervalo(datos):
    r = {x["tramo"]: x for x in datos["riesgo"]}
    assert set(r) == {"2", "16–20"} and r["2"]["tasa"] == pytest.approx(0.2) and r["16–20"]["tasa"] == pytest.approx(0.6) and r["2"]["n"] == 50
    ref = stats.binomtest(30, 50).proportion_ci(confidence_level=0.95, method="wilson")
    assert r["16–20"]["ic95"] == pytest.approx([ref.low, ref.high], abs=1e-12)


def test_embudo_nube_y_correlacion(datos):
    e = datos["embudo"]
    assert e[0]["id"] == "carga" and e[0]["antes"] == 100 and e[-1]["despues"] == 100 and all(p["antes"] - p["quitadas"] == p["despues"] for p in e)
    n = datos["nube"]
    assert n["n"] == 100 and n["de"] == 100 and {p["bug"] for p in n["puntos"]} == {0, 1} and len({(p["mccc"], p["loc"]) for p in n["puntos"]}) == 2
    assert datos["correlacion"]["mccc_loc"] is None                                          # LOC es constante (8) en esta tabla: no hay correlación que medir
    assert datos["correlacion"]["mccc_bug"] == pytest.approx(stats.spearmanr(np.r_[[20.0] * 50, [2.0] * 50], np.r_[[1.0] * 30, [0.0] * 20, [1.0] * 10, [0.0] * 40]).statistic)
    assert datos["meta"]["umbral_compleja"] == 10 and len(datos["meta"]["sha256"]) == 64


# ----------------------------------------------------------------------------- la curva ROC y las métricas que ahora trae la neurona


def test_roc_a_mano_con_cuatro_puntajes():
    puntaje = np.array([0.9, 0.8, 0.6, 0.2])
    etiqueta = np.array([1, 0, 1, 0])
    r = tstudent._curva_roc(puntaje, etiqueta)
    assert [(p["fpr"], p["tpr"]) for p in r["puntos"]] == [(0, 0), (0, 0.5), (0.5, 0.5), (0.5, 1.0), (1.0, 1.0)]
    assert r["auc_trapecios"] == pytest.approx(0.75)                                         # 3 de las 4 parejas (con bug, sin bug) están bien ordenadas
    assert tstudent._auc(puntaje, etiqueta) == pytest.approx(0.75)


def test_roc_con_empates_y_contra_scikit_learn():
    metricas = pytest.importorskip("sklearn.metrics")
    rng = np.random.default_rng(3)
    puntaje = np.round(rng.random(500), 1)                                                   # muchos empates a propósito
    etiqueta = (rng.random(500) < 0.2 + 0.5 * puntaje).astype(int)
    r = tstudent._curva_roc(puntaje, etiqueta, max_puntos=10_000)
    fpr, tpr, _ = metricas.roc_curve(etiqueta, puntaje, drop_intermediate=False)
    assert r["auc_trapecios"] == pytest.approx(metricas.roc_auc_score(etiqueta, puntaje), abs=1e-12)
    assert r["auc_trapecios"] == pytest.approx(tstudent._auc(puntaje, etiqueta), abs=1e-12)
    ref = {(round(float(a), 12), round(float(b), 12)) for a, b in zip(fpr, tpr)}
    assert {(round(p["fpr"], 12), round(p["tpr"], 12)) for p in r["puntos"]} == ref


def test_la_curva_se_reduce_a_pocos_puntos_para_dibujarla():
    rng = np.random.default_rng(1)
    r = tstudent._curva_roc(rng.random(3000), (rng.random(3000) < 0.3).astype(int), max_puntos=80)
    assert len(r["puntos"]) <= 80 and r["puntos"][0] == {"fpr": 0.0, "tpr": 0.0} and r["puntos"][-1] == {"fpr": 1.0, "tpr": 1.0}


def test_metricas_al_umbral_a_mano():
    m = tstudent._metricas(np.array([0.9, 0.8, 0.6, 0.2, 0.4]), np.array([1, 0, 1, 0, 1]))
    assert (m["vp"], m["fp"], m["fn"], m["vn"]) == (2, 1, 1, 1) and m["exactitud"] == pytest.approx(0.6)
    assert m["precision"] == pytest.approx(2 / 3) and m["sensibilidad"] == pytest.approx(2 / 3) and m["f1"] == pytest.approx(2 / 3)
    nada = tstudent._metricas(np.array([0.1, 0.2]), np.array([1, 0]))                        # el modelo nunca llega al umbral
    assert nada["precision"] is None and nada["f1"] is None and nada["sensibilidad"] == 0


def test_la_neurona_trae_roc_umbral_y_la_regla_trivial(cliente):
    cliente.post("/api/engine", json={"motor": "python"})
    cliente.post("/api/clean/apply", json={})
    n = cliente.get("/api/tstudent/neurona").json()
    assert n["roc"]["auc_trapecios"] == pytest.approx(n["auc_prueba"], abs=1e-12) and n["roc"]["puntos"][0] == {"fpr": 0.0, "tpr": 0.0}
    u = n["umbral"]
    assert u["vp"] + u["fp"] + u["fn"] + u["vn"] == n["n_prueba"] and 0 <= u["exactitud"] <= 1
    assert n["regla_trivial"]["exactitud"] == pytest.approx(0.6)                              # 60 de cada 100 archivos no tienen bug
