"""Rutas por defecto (sin Ada y con Ada) y el CSV real incluido en data/raw: huella, tamaño y resultados conocidos."""
from __future__ import annotations

import hashlib
import re

import pytest
from fastapi.testclient import TestClient

from app.core import cleaning, config

SOURCE = config.ROOT / "data" / "raw" / "SOURCE.md"
CSV = config.ROOT / "data" / "raw" / "Unified-file.csv"


@pytest.fixture
def sin_variables(monkeypatch):
    for v in ("CODEPREDICT_DATASET", "CODEPREDICT_WORK", "ADA_ROOT"):
        monkeypatch.delenv(v, raising=False)


def test_el_csv_incluido_coincide_con_su_huella_publicada():
    esperado = re.search(r"SHA-256 de este CSV:\*\* `([0-9a-f]{64})`", SOURCE.read_text(encoding="utf-8")).group(1)
    assert hashlib.sha256(CSV.read_bytes()).hexdigest() == esperado          # byte a byte igual al del ZIP original de Zenodo
    assert CSV.stat().st_size == 7_163_994


def test_sin_ada_usa_los_datos_y_la_salida_del_propio_repositorio(sin_variables, monkeypatch, tmp_path):
    monkeypatch.setattr(config, "ada_root", lambda: tmp_path / "no-hay-ada")
    assert config.dataset_path() == CSV.resolve()
    assert config.work_dir() == (config.ROOT / "data" / "work" / "codepredict").resolve()   # nunca crea carpetas fuera del repositorio


def test_con_ada_la_salida_va_a_su_carpeta_de_trabajo(sin_variables, monkeypatch, tmp_path):
    (tmp_path / "Ada" / "src" / "ada").mkdir(parents=True)
    monkeypatch.setattr(config, "ada_root", lambda: tmp_path / "Ada")
    assert config.work_dir() == (tmp_path / "Ada" / "data" / "work" / "codepredict").resolve()


def test_las_variables_de_entorno_mandan(monkeypatch, tmp_path):
    monkeypatch.setenv("CODEPREDICT_DATASET", str(tmp_path / "otro.csv"))
    monkeypatch.setenv("CODEPREDICT_WORK", str(tmp_path / "salida"))
    assert config.dataset_path() == (tmp_path / "otro.csv").resolve() and config.work_dir() == (tmp_path / "salida").resolve()


def test_con_el_csv_real_la_limpieza_da_los_conteos_de_la_bitacora(sin_variables, monkeypatch, tmp_path):
    """43 744 − 4 copias − 11 231 rutas repetidas = 32 509 (= rutas distintas) y la tabla 2×2 de la bitácora."""
    from app.main import app

    monkeypatch.setenv("CODEPREDICT_WORK", str(tmp_path / "work"))
    raw = cleaning.load_raw(config.dataset_path())
    assert raw.shape == (43_744, 11)
    r = TestClient(app).post("/api/clean/preview", json={}).json()
    assert (r["rows_in"], r["rows_out"], r["verified"]) == (43_744, 32_509, True)
    assert r["table2x2"] == {"C_D": 3763, "C_ND": 5273, "NC_D": 3721, "NC_ND": 19752}
