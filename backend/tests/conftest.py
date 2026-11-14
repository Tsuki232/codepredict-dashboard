"""Datos sintéticos pequeños, con TODOS los resultados calculados a mano (ver cada prueba)."""
from __future__ import annotations

import pandas as pd
import pytest

COLS = ["ID", "Name", "LongName", "Parent", "McCC", "CLOC", "PDA", "PUA", "LLOC", "LOC", "bug"]


def _row(i: str, path: str, mccc: int, lloc: int, loc: int, bug: int) -> list:
    return [i, path.split("/")[-1], path, "P", mccc, 0, 0, 0, lloc, loc, bug]


def tiny_rows() -> list[list]:
    """10 filas con trampas conocidas:
    fila 5 = copia exacta de la 1 · fila 6 repite la ruta de la 1 con otros valores · fila 9 tiene LOC < LLOC · fila 10 es un atípico enorme."""
    return [
        _row("L1", "x/a.java", 2, 5, 8, 0),
        _row("L2", "x/b.java", 12, 40, 60, 1),
        _row("L3", "x/c.java", 15, 50, 70, 0),
        _row("L4", "x/d.java", 3, 10, 15, 2),
        _row("L1", "x/a.java", 2, 5, 8, 0),      # duplicado exacto de la fila 1
        _row("L6", "x/a.java", 4, 9, 12, 1),     # misma ruta que la fila 1
        _row("L7", "x/e.java", 11, 30, 45, 1),
        _row("L8", "x/f.java", 1, 3, 4, 0),
        _row("L9", "x/g.java", 5, 20, 10, 0),    # LOC < LLOC: incoherente
        _row("L10", "x/h.java", 200, 900, 1200, 5),  # atípico extremo
    ]


@pytest.fixture
def tiny_df() -> pd.DataFrame:
    df = pd.DataFrame(tiny_rows(), columns=COLS)
    for c in ("ID", "Name", "LongName", "Parent"):
        df[c] = df[c].astype("string")
    return df


def table_rows() -> list[list]:
    """Tabla 2×2 de la prueba de inferencia: C∩D = 30, C∩¬D = 20, ¬C∩D = 10, ¬C∩¬D = 40 (n = 100). McCC vale 20 (compleja) o 2."""
    rows, k = [], 0
    for n, mccc, bug in ((30, 20, 1), (20, 20, 0), (10, 2, 1), (40, 2, 0)):
        for _ in range(n):
            k += 1
            rows.append(_row(f"T{k}", f"t/f{k}.java", mccc, 5, 8, bug))
    return rows


@pytest.fixture
def env(tmp_path, monkeypatch):
    """Entorno aislado: CSV de entrada y carpeta de trabajo temporales; Ada no se carga (se prueba aparte)."""
    from app.core import ada_engine

    src = tmp_path / "entrada" / "Unified-file.csv"
    src.parent.mkdir()
    pd.DataFrame(tiny_rows(), columns=COLS).to_csv(src, index=False)
    work = tmp_path / "work" / "codepredict"
    monkeypatch.setenv("CODEPREDICT_DATASET", str(src))
    monkeypatch.setenv("CODEPREDICT_WORK", str(work))

    def _no_ada():
        raise ada_engine.AdaNotReady("Ada no cargada en esta prueba")

    monkeypatch.setattr(ada_engine, "require", _no_ada)
    return {"src": src, "work": work, "tmp": tmp_path}
