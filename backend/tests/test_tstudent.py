"""La t de Student del panel: valores calculados a mano, comprobación por permutación y la neurona, sin Ada ni ninguna IA."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from scipy import stats

from app.core import analisis_t, tstudent
from app.main import app
from tests.conftest import COLS, table_rows

X = np.array([20.0] * 30 + [2.0] * 10)          # con bug:  media 15.5
Y = np.array([20.0] * 20 + [2.0] * 40)          # sin bug:  media 8.0


# ----------------------------------------------------------------------------- la t de Welch a mano


def _a_mano():
    vx, vy = 30 * 10 * 18**2 / (40 * 39), 20 * 40 * 18**2 / (60 * 59)      # varianza de una variable con dos valores: n₁·n₂·d²/(n(n−1))
    a, b = vx / 40, vy / 60
    return {"dif": 7.5, "se": math.sqrt(a + b), "t": 7.5 / math.sqrt(a + b), "gl": (a + b) ** 2 / (a**2 / 39 + b**2 / 59), "sx": math.sqrt(vx), "sy": math.sqrt(vy)}


def test_welch_paso_a_paso_coincide_con_la_formula_escrita_a_mano():
    h = _a_mano()
    r = tstudent.welch(X, Y)
    assert r["pasos"]["diferencia"] == pytest.approx(7.5) and r["pasos"]["error_estandar"] == pytest.approx(h["se"], rel=1e-12)
    assert r["t"] == pytest.approx(h["t"], rel=1e-12) and r["gl"] == pytest.approx(h["gl"], rel=1e-12)
    assert r["p"] == pytest.approx(2 * stats.t.sf(abs(h["t"]), h["gl"]), rel=1e-12)
    assert r["grupos"]["con_bug"]["sd"] == pytest.approx(h["sx"]) and r["grupos"]["sin_bug"]["sd"] == pytest.approx(h["sy"])
    assert r["critico"]["alto"] == pytest.approx(stats.t.ppf(0.975, h["gl"])) and r["critico"]["bajo"] == pytest.approx(-r["critico"]["alto"])
    assert r["ic_diferencia"]["bajo"] == pytest.approx(7.5 - stats.t.ppf(0.975, h["gl"]) * h["se"])
    assert r["rechaza"] is True and r["verificacion"]["coincide"] is True


def test_el_intervalo_de_confianza_de_cada_media_usa_la_t_con_n_menos_1_grados():
    g = tstudent.welch(X, Y)["grupos"]["con_bug"]
    assert g["gl"] == 39 and g["se"] == pytest.approx(g["sd"] / math.sqrt(40))
    assert g["ic_bajo"] == pytest.approx(15.5 - stats.t.ppf(0.975, 39) * g["se"]) and g["ic_alto"] == pytest.approx(15.5 + stats.t.ppf(0.975, 39) * g["se"])


def test_las_tres_hipotesis_alternativas_son_coherentes_entre_si():
    dos, mayor, menor = (tstudent.welch(X, Y, 0.05, a) for a in ("two-sided", "greater", "less"))
    assert dos["p"] == pytest.approx(2 * min(mayor["p"], menor["p"])) and mayor["p"] < 0.5 < menor["p"]
    assert mayor["critico"]["bajo"] is None and mayor["critico"]["alto"] == pytest.approx(stats.t.ppf(0.95, mayor["gl"]))
    assert menor["critico"]["alto"] is None and menor["rechaza"] is False and mayor["rechaza"] is True


def test_la_t_clasica_se_calcula_con_varianza_agrupada_solo_para_comparar():
    c = tstudent.welch(X, Y)["student_clasica"]
    sp2 = (39 * X.var(ddof=1) + 59 * Y.var(ddof=1)) / 98
    assert c["gl"] == 98 and c["t"] == pytest.approx(7.5 / math.sqrt(sp2 * (1 / 40 + 1 / 60)))
    assert c["razon_varianzas"] == pytest.approx(X.var(ddof=1) / Y.var(ddof=1))


def test_datos_invalidos_se_rechazan_con_un_mensaje():
    with pytest.raises(ValueError, match="al menos 2"):
        tstudent.welch([1.0], [1.0, 2.0])
    with pytest.raises(ValueError, match="alpha"):
        tstudent.welch(X, Y, alpha=1.5)
    with pytest.raises(ValueError, match="alternative"):
        tstudent.welch(X, Y, alternative="otra")


# ----------------------------------------------------------------------------- permutación


def test_la_permutacion_es_reproducible_y_su_t_observada_es_la_de_welch():
    a, b = tstudent.permutacion(X, Y, 500, 7), tstudent.permutacion(X, Y, 500, 7)
    assert a["t_perm"] == b["t_perm"] and a["t_obs"] == pytest.approx(tstudent.welch(X, Y)["t"], rel=1e-12)
    assert tstudent.permutacion(X, Y, 500, 8)["t_perm"] != a["t_perm"]


def test_si_no_hay_diferencia_real_las_barajadas_se_parecen_a_la_observada():
    rng = np.random.default_rng(0)
    p = tstudent.permutacion(rng.normal(10, 3, 200), rng.normal(10, 3, 300), 2000, 1)
    assert abs(p["media_perm"]) < 0.1 and p["sd_perm"] == pytest.approx(1.0, abs=0.08), "sin diferencia, la t barajada es casi una campana estándar"
    assert p["p"] > 0.01 and abs(p["t_obs"]) < 4


def test_con_una_diferencia_enorme_ninguna_barajada_la_alcanza_y_el_p_es_el_minimo_medible():
    r = tstudent.permutacion(X + 100, Y, 1000, 3)
    assert r["extremos"] == 0 and r["p"] == pytest.approx(1 / 1001) and r["p_minimo"] == pytest.approx(1 / 1001)
    assert r["max_abs_perm"] < abs(r["t_obs"])


def test_la_permutacion_concuerda_con_el_valor_p_de_la_t_en_un_caso_moderado():
    rng = np.random.default_rng(5)
    x, y = rng.normal(10.6, 3, 150), rng.normal(10.0, 3, 150)
    w, p = tstudent.welch(x, y), tstudent.permutacion(x, y, 8000, 9)
    assert p["p"] == pytest.approx(w["p"], abs=0.03), "dos algoritmos independientes dan casi el mismo valor p"


# ----------------------------------------------------------------------------- la neurona


def _datos_logisticos(n=6000, a=-2.0, c=0.8, semilla=3):
    rng = np.random.default_rng(semilla)
    m = np.round(rng.lognormal(1.5, 1.0, n))
    p = 1 / (1 + np.exp(-(a + c * np.log1p(m))))
    return m, (rng.random(n) < p).astype(float)


def test_la_neurona_recupera_la_curva_con_la_que_se_generaron_los_datos():
    m, y = _datos_logisticos()
    r = tstudent.neurona(m, y)
    assert r["formula"]["pendiente_log"] == pytest.approx(0.8, abs=0.12) and r["formula"]["intercepto"] == pytest.approx(-2.0, abs=0.25)
    assert r["verificacion"]["coincide"] is True and r["historia"][-1]["perdida"] < r["historia"][0]["perdida"]


def test_la_neurona_da_lo_mismo_que_scikit_learn():
    sk = pytest.importorskip("sklearn.linear_model")
    metricas = pytest.importorskip("sklearn.metrics")
    m, y = _datos_logisticos(8000, -1.5, 0.6, 11)
    r = tstudent.neurona(m, y)
    u = np.log1p(m)
    rng = np.random.default_rng(tstudent.SEMILLA)
    prueba = np.zeros(u.size, bool)
    for clase in (0, 1):                                            # misma partición que usa la neurona
        idx = np.flatnonzero(y == clase)
        prueba[rng.choice(idx, size=int(round(0.2 * idx.size)), replace=False)] = True
    z = (u - u[~prueba].mean()) / u[~prueba].std()
    modelo = sk.LogisticRegression(C=1e12, solver="lbfgs", max_iter=2000).fit(z[~prueba].reshape(-1, 1), y[~prueba])
    assert r["w"] == pytest.approx(float(modelo.coef_[0, 0]), abs=2e-3) and r["b"] == pytest.approx(float(modelo.intercept_[0]), abs=2e-3)
    p = modelo.predict_proba(z[prueba].reshape(-1, 1))[:, 1]
    assert r["auc_prueba"] == pytest.approx(metricas.roc_auc_score(y[prueba], p), abs=1e-6), "el AUC calculado con rangos coincide con el de scikit-learn"


def test_las_probabilidades_crecen_con_la_complejidad_y_son_probabilidades():
    m, y = _datos_logisticos()
    ej = tstudent.neurona(m, y)["ejemplos"]
    ps = [e["p"] for e in ej]
    assert ps == sorted(ps) and all(0 < p < 1 for p in ps)


def test_las_predicciones_por_tramos_se_parecen_a_lo_observado():
    r = tstudent.neurona(*_datos_logisticos(12000))
    assert all(abs(t["observado"] - t["predicho"]) < 0.06 for t in r["tramos"] if t["n"] > 400)


# ----------------------------------------------------------------------------- la API (sin Ada)


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
    return TestClient(app)


def test_sin_conjunto_limpio_guardado_las_rutas_piden_limpiar_primero(cliente):
    for ruta in ("/api/tstudent", "/api/tstudent/permutacion", "/api/tstudent/neurona"):
        r = cliente.get(ruta)
        assert r.status_code == 409 and "limpieza" in r.json()["detail"].lower(), ruta


def test_con_el_conjunto_limpio_la_t_sale_sin_ada_y_coincide_con_la_mano(cliente, monkeypatch):
    """La limpieza la hace Python (modo elegido); la estadística nunca toca a Ada."""
    cliente.post("/api/engine", json={"motor": "python"})
    assert cliente.post("/api/clean/apply", json={}).status_code == 200
    from app.core import ada_engine

    monkeypatch.setattr(ada_engine, "require", lambda: (_ for _ in ()).throw(AssertionError("la estadística no debe pedirle nada a Ada")))
    d = cliente.get("/api/tstudent").json()
    h = _a_mano()
    assert d["t"] == pytest.approx(h["t"], rel=1e-9) and d["gl"] == pytest.approx(h["gl"], rel=1e-9) and d["verificacion"]["coincide"] is True
    assert d["meta"]["filas"] == 100 and len(d["meta"]["sha256"]) == 64
    assert cliente.get("/api/tstudent", params={"alpha": 0.01, "alternativa": "greater"}).json()["alpha"] == 0.01


def test_la_permutacion_y_la_neurona_responden_con_su_comprobacion(cliente):
    cliente.post("/api/engine", json={"motor": "python"})
    cliente.post("/api/clean/apply", json={})
    p = cliente.get("/api/tstudent/permutacion", params={"repeticiones": 300, "semilla": 5}).json()
    assert len(p["t_perm"]) == 300 and p["repeticiones"] == 300 and p["t_obs"] == pytest.approx(_a_mano()["t"], rel=1e-6)
    n = cliente.get("/api/tstudent/neurona").json()
    assert n["verificacion"]["coincide"] is True and 0.5 < n["auc_prueba"] <= 1 and len(n["historia"]) > 10


def test_los_parametros_fuera_de_rango_se_rechazan(cliente):
    cliente.post("/api/engine", json={"motor": "python"})
    cliente.post("/api/clean/apply", json={})
    assert cliente.get("/api/tstudent/permutacion", params={"repeticiones": 5}).status_code == 422
    assert cliente.get("/api/tstudent/permutacion", params={"repeticiones": 10**7}).status_code == 422
    assert cliente.get("/api/tstudent", params={"alpha": 2}).status_code == 422
    assert cliente.get("/api/tstudent", params={"alternativa": "otra"}).status_code == 422
