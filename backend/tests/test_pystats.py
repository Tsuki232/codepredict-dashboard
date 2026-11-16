"""Motor estadístico LOCAL de Python (sin Ada): valores calculados a mano y, si Ada está en este equipo, igualdad con sus resultados."""
from __future__ import annotations

import math
import sys

import numpy as np
import pandas as pd
import pytest
from scipy import stats

from app.core import ada_engine, config, pystats
from tests.conftest import COLS, table_rows

PY = pystats.construir()


# ----------------------------------------------------------------------------- a mano


def test_welch_con_la_formula_de_welch_satterthwaite_a_mano():
    """x = 30 veces 20 y 10 veces 2 (media 15.5); y = 20 veces 20 y 40 veces 2 (media 8)."""
    x, y = [20.0] * 30 + [2.0] * 10, [20.0] * 20 + [2.0] * 40
    vx, vy = 30 * 10 * (18 ** 2) / (40 * 39), 20 * 40 * (18 ** 2) / (60 * 59)          # varianza muestral de una variable de dos valores: n1·n2·d²/(n(n-1))
    se2 = vx / 40 + vy / 60
    t_mano = 7.5 / math.sqrt(se2)
    df_mano = se2 ** 2 / ((vx / 40) ** 2 / 39 + (vy / 60) ** 2 / 59)
    r = PY.inference.compare_two_groups(x, y, method="welch", alternative="two-sided", alpha=0.05, sensitivity=False)
    assert r["estimate"] == pytest.approx(7.5) and r["n"] == [40, 60] and r["descriptives"]["x"]["mean"] == pytest.approx(15.5)
    assert r["statistic"] == pytest.approx(t_mano, rel=1e-10) and r["df"] == pytest.approx(df_mano, rel=1e-10)
    assert r["p_value"] == pytest.approx(2 * stats.t.sf(abs(t_mano), df_mano), rel=1e-10) and r["verified"] is True
    assert r["ci"]["low"] == pytest.approx(7.5 - stats.t.ppf(0.975, df_mano) * math.sqrt(se2), rel=1e-10)
    assert any("Python" in m for m in r["verification_methods"]), "debe decir que NO es Ada"
    assert "MAYOR" in PY.inference.compact_result(r)["direction"]


def test_una_cola_usa_el_ic_bilateral_de_nivel_1_menos_2_alfa_como_ada():
    x, y = np.arange(1.0, 21.0), np.arange(5.0, 30.0)
    g = PY.inference.compare_two_groups(x, y, method="welch", alternative="greater", alpha=0.05)
    two = PY.inference.compare_two_groups(x, y, method="welch", alternative="two-sided", alpha=0.10)
    assert g["ci"]["low"] == pytest.approx(two["ci"]["low"]) and g["ci"]["high"] == pytest.approx(two["ci"]["high"])


def test_chi_cuadrado_de_la_tabla_de_100_archivos():
    """C∩D=30, C∩¬D=20, ¬C∩D=10, ¬C∩¬D=40 → esperados [[20,30],[20,30]], χ² = 50/3, V = √(χ²/n)."""
    r = PY.inference.chi_square_independence([[30, 20], [10, 40]])
    assert r["statistic"] == pytest.approx(50 / 3) and r["df"] == 1 and r["expected"] == [[20.0, 30.0], [20.0, 30.0]]
    assert r["effect_size"]["value"] == pytest.approx(math.sqrt(50 / 3 / 100)) and r["verified"] is True and r["test"].startswith("Chi-cuadrado")


def test_fisher_exacta_cuando_hay_esperados_menores_que_5():
    """[[3,2],[1,4]]: P(a=k) = C(5,k)·C(5,4-k)/C(10,4) → 5, 50, 100, 50, 5 sobre 210; p bilateral = (5+50+50+5)/210."""
    r = PY.inference.chi_square_independence([[3, 2], [1, 4]])
    assert r["test"] == "Prueba exacta de Fisher" and r["statistic"] == pytest.approx(6.0) and r["p_value"] == pytest.approx(110 / 210)


def test_dos_proporciones_a_mano():
    """30/50 frente a 10/50: p conjunta 0.4, z = 0.4/√(0.4·0.6·(2/50)) = √(50/3); razón de momios = 30·40/(10·20) = 6."""
    r = PY.inference.two_proportions([30, 10], [50, 50])
    assert r["statistic"] == pytest.approx(math.sqrt(50 / 3)) and r["estimate"] == pytest.approx(0.4) and r["effect_size"]["value"] == pytest.approx(6.0)
    assert r["p_value"] == pytest.approx(2 * stats.norm.sf(math.sqrt(50 / 3))) and r["verified"] is True and r["proportions"] == [0.6, 0.2]
    assert r["ci"]["low"] < 0.4 < r["ci"]["high"]


def test_bayes_desde_los_datos_a_mano():
    """P(D)=0.4, P(C|D)=30/40=0.75, P(C|¬D)=20/60, P(C)=0.5 → P(D|C) = 0.75·0.4/0.5 = 0.6 = 30/50."""
    df = pd.DataFrame(table_rows(), columns=COLS)
    b = PY.probability.run_probability("bayes", df=df, A={"column": "bug", "op": ">", "value": 0}, B={"column": "McCC", "op": ">", "value": 10})
    assert b["posterior"] == pytest.approx(0.6) and b["prior"] == pytest.approx(0.4) and b["p_C"] == pytest.approx(0.5) and b["p_C_given_D"] == pytest.approx(0.75)
    assert b["counts"] == {"D": 40, "DC": 30, "nDC": 20, "nD": 60, "C": 50} and b["verified"] is True and b["events"] == {"D": "bug > 0", "C": "McCC > 10"}


# ----------------------------------------------------------------------------- límites honestos


def test_lo_que_python_no_ofrece_se_dice_en_vez_de_inventarlo():
    with pytest.raises(ValueError, match="solo ofrece la t de Welch"):
        PY.inference.compare_two_groups([1, 2, 3], [4, 5, 6], method="mann_whitney")
    with pytest.raises(ValueError, match="solo ofrece el teorema de Bayes"):
        PY.probability.run_probability("union", df=pd.DataFrame({"a": [1]}), A={}, B={})
    with pytest.raises(ValueError, match="sin datos"):
        PY.inference.chi_square_independence([[5, 0], [3, 0]])
    with pytest.raises(ValueError, match="fuera de rango"):
        PY.inference.two_proportions([9, 1], [5, 5])
    with pytest.raises(ValueError, match="al menos 2"):
        PY.inference.compare_two_groups([1.0], [2.0, 3.0], method="welch")
    with pytest.raises(ValueError, match="Bayes necesita"):
        PY.probability.run_probability("bayes", df=pd.DataFrame({"bug": [0, 0], "McCC": [1, 2]}), A={"column": "bug", "op": ">", "value": 0}, B={"column": "McCC", "op": ">", "value": 0})


def test_la_auditoria_de_ada_no_existe_en_python_y_el_guardado_lo_tolera():
    with pytest.raises(ada_engine.AdaNotReady, match="auditoría"):
        PY.assert_safe_write_path("x")


# ----------------------------------------------------------------------------- igual que Ada (si Ada está en este equipo)


@pytest.fixture(scope="module")
def ada():
    if not config.ada_present():
        pytest.skip("Ada no está en este equipo")
    sys.path.insert(0, str(config.ada_root() / "src"))
    from ada.stats import inference, probability

    return type("Ada", (), {"inference": inference, "probability": probability})


_TEXTO = {"verification_methods", "warnings", "rationale"}      # el texto de las vías y avisos es distinto a propósito (Python dice que no es Ada)


def _igual(a, b, ruta=""):
    if isinstance(a, dict):
        assert isinstance(b, dict), ruta
        for k in {*a, *b} - _TEXTO:
            assert k in a and k in b, f"{ruta}.{k} falta en uno de los dos"
            _igual(a[k], b[k], f"{ruta}.{k}")
    elif isinstance(a, (list, tuple)):
        assert len(a) == len(b), ruta
        for i, (u, v) in enumerate(zip(a, b)):
            _igual(u, v, f"{ruta}[{i}]")
    elif isinstance(a, float):
        assert b == pytest.approx(a, rel=1e-9, abs=1e-12), f"{ruta}: {a} != {b}"
    else:
        assert a == b, f"{ruta}: {a!r} != {b!r}"


@pytest.mark.parametrize("alt", ["two-sided", "greater", "less"])
def test_welch_python_es_igual_al_de_ada(ada, alt):
    rng = np.random.default_rng(3)
    x, y = rng.lognormal(2.3, 0.9, 300), rng.lognormal(1.9, 0.9, 500)
    a = ada.inference.compare_two_groups(x, y, method="welch", alternative=alt, sensitivity=False)
    b = PY.inference.compare_two_groups(x, y, method="welch", alternative=alt, sensitivity=False)
    _igual(ada.inference.compact_result(a), PY.inference.compact_result(b))
    _igual(a["assumptions"], b["assumptions"])


@pytest.mark.parametrize("tabla", [[[30, 20], [10, 40]], [[3, 2], [1, 4]], [[10, 20, 30], [20, 15, 5]]])
def test_chi_cuadrado_y_fisher_python_son_iguales_a_los_de_ada(ada, tabla):
    _igual(ada.inference.compact_result(ada.inference.chi_square_independence(tabla)), PY.inference.compact_result(PY.inference.chi_square_independence(tabla)))


@pytest.mark.parametrize("exitos,n", [([30, 10], [50, 50]), ([3, 1], [8, 9]), ([4300, 1900], [10000, 9000])])
def test_dos_proporciones_python_son_iguales_a_las_de_ada(ada, exitos, n):
    _igual(ada.inference.compact_result(ada.inference.two_proportions(exitos, n)), PY.inference.compact_result(PY.inference.two_proportions(exitos, n)))


def test_bayes_python_es_igual_al_de_ada(ada):
    df = pd.DataFrame(table_rows(), columns=COLS)
    A, B = {"column": "bug", "op": ">", "value": 0}, {"column": "McCC", "op": ">", "value": 10}
    _igual(ada.probability.compact_probability(ada.probability.run_probability("bayes", df=df, A=A, B=B)),
           PY.probability.compact_probability(PY.probability.run_probability("bayes", df=df, A=A, B=B)))
