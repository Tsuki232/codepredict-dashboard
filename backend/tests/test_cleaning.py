"""Pruebas de las reglas de limpieza con valores calculados a mano (ver conftest.tiny_rows)."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.core import cleaning as cl


def steps(res):
    return {s.id: s for s in res.steps}


def test_pipeline_por_defecto_cuenta_cada_regla(tiny_df):
    res = cl.run_pipeline(tiny_df, cl.Rules(), verify=True)
    s = steps(res)
    # 10 filas → integridad quita la fila 9 → duplicados quita la fila 5 → rutas deja la 1.ª y quita la fila 6 → 7 filas
    assert (s["carga"].after, s["integridad"].after, s["duplicados"].after, s["rutas"].after) == (10, 9, 8, 7)
    assert s["integridad"].detail["loc_menor_que_lloc"] == 1
    assert s["rutas"].detail["filas_en_rutas_repetidas"] == 2   # fila 1 y fila 6 (la 5 ya se quitó)
    assert res.dropped_columns == ["CLOC", "PDA", "PUA"]         # las tres valen 0 siempre
    assert res.verified and all(x.verified for x in res.steps)   # pandas y DuckDB coinciden en todo
    assert len(res.frame) == 7


def test_tabla_2x2_a_mano(tiny_df):
    f = cl.run_pipeline(tiny_df, cl.Rules(), verify=True).frame
    # Filas que quedan: L1(McCC2,bug0) L2(12,1) L3(15,0) L4(3,2) L7(11,1) L8(1,0) L10(200,5)
    # compleja = McCC>10: L2 L3 L7 L10 · defectuoso = bug>0: L2 L4 L7 L10
    assert cl.table2x2(f) == {"C_D": 3, "C_ND": 1, "NC_D": 1, "NC_ND": 2}
    assert int(f["defectuoso"].sum()) == 4 and int(f["compleja"].sum()) == 4


def test_politica_drop_all_quita_las_dos_filas_de_la_ruta(tiny_df):
    res = cl.run_pipeline(tiny_df, cl.Rules(path_policy="drop_all"), verify=True)
    assert len(res.frame) == 6 and res.verified
    assert "x/a.java" not in set(res.frame["LongName"])


def test_politica_keep_all_conserva_las_repetidas(tiny_df):
    res = cl.run_pipeline(tiny_df, cl.Rules(path_policy="keep_all"), verify=True)
    assert len(res.frame) == 8 and res.verified  # 10 − fila 9 − fila 5


def test_umbrales_de_atipicos_a_mano(tiny_df):
    res = cl.run_pipeline(tiny_df, cl.Rules(outlier_policy="tukey3"), verify=True)
    # McCC (7 filas) ordenado: 1 2 3 11 12 15 200 → Q1 = 2.5, Q3 = 13.5, RIC = 11 → cerca = 13.5 + 3·11 = 46.5
    # LOC  (7 filas) ordenado: 4 8 15 45 60 70 1200 → Q1 = 11.5, Q3 = 65, RIC = 53.5 → cerca = 65 + 3·53.5 = 225.5
    assert res.fences["McCC"]["tukey3_upper"] == pytest.approx(46.5)
    assert res.fences["LOC"]["tukey3_upper"] == pytest.approx(225.5)
    assert steps(res)["atipicos"].removed == 1          # solo L10
    assert "x/h.java" not in set(res.frame["LongName"])
    assert res.verified


def test_conservar_atipicos_solo_los_senala(tiny_df):
    res = cl.run_pipeline(tiny_df, cl.Rules(outlier_policy="keep"), verify=True)
    a = steps(res)["atipicos"]
    assert a.removed == 0 and a.detail["se_quitarian_tukey3"] == 1
    assert len(res.frame) == 7


def test_faltantes_se_detectan_y_duckdb_los_trata_como_nulos(tiny_df):
    df = tiny_df.copy()
    df["McCC"] = df["McCC"].astype(float)
    df.loc[1, "McCC"] = np.nan                 # una fila con McCC vacío
    res = cl.run_pipeline(df, cl.Rules(), verify=True)
    assert steps(res)["integridad"].detail["faltantes"] == 1
    assert steps(res)["integridad"].removed == 2  # el vacío (L2) y la fila 9 (LOC < LLOC)
    assert res.verified


def test_la_entrada_no_se_modifica(tiny_df):
    before = tiny_df.copy(deep=True)
    cl.run_pipeline(tiny_df, cl.Rules(path_policy="drop_all", outlier_policy="p999"), verify=True)
    pd.testing.assert_frame_equal(tiny_df, before)


def test_impacto_por_politica_tiene_las_nueve_combinaciones(tiny_df):
    rows = cl.policy_impact(tiny_df, cl.Rules())
    assert len(rows) == 9 and sum(r["selected"] for r in rows) == 1
    base = next(r for r in rows if r["path_policy"] == "keep_first" and r["outlier_policy"] == "keep")
    assert base["n"] == 7 and base["table"]["C_D"] == 3


def test_histograma_logaritmico_suma_todos_los_datos(tiny_df):
    h = cl.log_hist({"a": tiny_df["McCC"].to_numpy(float)})
    assert sum(h["counts"]["a"]) == len(tiny_df)
    assert h["edges"][0] == 1.0
