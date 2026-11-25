"""«Abrir CodePredict» (un solo clic): el motor Python solo se declara si se pide, el lanzador sabe qué falta y prepara los datos la primera vez,
y los archivos de arranque cumplen lo que se prometió (nada de PowerShell, finales de línea correctos, mismas dependencias que pyproject)."""
from __future__ import annotations

import importlib.util
import re
import socket
import tomllib
from pathlib import Path

import pandas as pd
import pytest

from app.core import ada_engine, ada_proceso, inference, notebook, workspace
from tests.conftest import COLS, table_rows

RAIZ = Path(__file__).resolve().parents[2]


def _cargar_abrir():
    spec = importlib.util.spec_from_file_location("abrir_codepredict", RAIZ / "scripts" / "abrir.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


abrir = _cargar_abrir()


@pytest.fixture
def equipo_sin_ada(tmp_path, monkeypatch):
    """Un equipo cualquiera: sin Ada, con el CSV y una carpeta de trabajo vacía (la de la prueba)."""
    csv = tmp_path / "entrada" / "Unified-file.csv"
    csv.parent.mkdir()
    pd.DataFrame(table_rows(), columns=COLS).to_csv(csv, index=False)
    monkeypatch.setenv("CODEPREDICT_DATASET", str(csv))
    monkeypatch.setenv("CODEPREDICT_WORK", str(tmp_path / "work" / "codepredict"))
    monkeypatch.setenv("ADA_ROOT", str(tmp_path / "aqui-no-hay-ada"))
    for k in ("ADA_ENGINE", "ADA_REMOTE_URL", "ADA_REMOTE_KEY", "CODEPREDICT_MOTOR"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(ada_engine, "_state", {"phase": "idle", "error": None, "seconds": None, "mode": None, "note": None})
    monkeypatch.setattr(ada_engine, "_mods", None)
    monkeypatch.setattr(ada_engine, "_py_mods", None)
    monkeypatch.setattr(ada_engine, "_pref", {"motor": "ada"})
    inference._cached.cache_clear()
    inference._live_cached.cache_clear()
    ada_proceso.limpiar_cache()
    notebook.reset()
    return tmp_path


# ----------------------------------------------------------------------------- el motor Python solo se declara si se pide


@pytest.mark.parametrize("valor,esperado", [("python", "python"), ("  PYTHON ", "python"), ("", "ada"), ("ada", "ada"), ("otra cosa", "ada")])
def test_el_motor_inicial_solo_es_python_si_se_pide(monkeypatch, valor, esperado):
    monkeypatch.setenv("CODEPREDICT_MOTOR", valor)
    assert ada_engine._motor_inicial() == esperado


def test_sin_la_variable_el_motor_inicial_es_ada(monkeypatch):
    monkeypatch.delenv("CODEPREDICT_MOTOR", raising=False)
    assert ada_engine._motor_inicial() == "ada"


# ----------------------------------------------------------------------------- el lanzador


def test_puerto_libre_salta_los_ocupados_y_avisa_si_no_queda_ninguno():
    p = abrir.puerto_libre(18000, 18040)
    with socket.socket() as ocupa:
        ocupa.bind(("127.0.0.1", p))
        assert abrir.puerto_libre(p, p + 40) > p                                  # el ocupado no se elige
        with pytest.raises(RuntimeError, match="ningún puerto libre"):
            abrir.puerto_libre(p, p)


def test_faltantes_dice_que_hace_falta_y_como_arreglarlo(tmp_path, monkeypatch):
    monkeypatch.setattr(abrir, "RAIZ", tmp_path)
    monkeypatch.setattr(abrir, "CSV", tmp_path / "data" / "raw" / "Unified-file.csv")
    monkeypatch.setattr(abrir, "INTERFAZ", tmp_path / "frontend" / "dist" / "index.html")
    msgs = abrir.faltantes()
    assert len(msgs) == 2 and "Unified-file.csv" in msgs[0] and "frontend/dist" in msgs[1] and all("GitHub" in m for m in msgs)
    for ruta in (abrir.CSV, abrir.INTERFAZ):
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text("x")
    assert abrir.faltantes() == []


def test_hay_ada_es_falso_sin_carpeta_ni_api_y_verdadero_con_la_api(equipo_sin_ada, monkeypatch):
    assert abrir.hay_ada() is False
    monkeypatch.setenv("ADA_REMOTE_URL", "https://ada.ejemplo.test")
    monkeypatch.setenv("ADA_REMOTE_KEY", "clave-de-prueba")
    assert abrir.hay_ada() is True


def test_la_primera_vez_prepara_los_datos_con_python_y_el_manifiesto_lo_dice(equipo_sin_ada, monkeypatch, capsys):
    monkeypatch.setattr(ada_engine, "_pref", {"motor": "python"})                 # lo que deja CODEPREDICT_MOTOR=python al arrancar
    assert workspace.read_manifest() is None
    abrir.preparar_datos()
    man = workspace.read_manifest()
    assert man is not None and man["engine"] == "python-local" and man["output"]["rows"] == 100
    assert "Primera vez" in capsys.readouterr().out
    sello = man["output"]["sha256"]
    abrir.preparar_datos()                                                        # la segunda vez no hace nada
    assert workspace.read_manifest()["output"]["sha256"] == sello and capsys.readouterr().out == ""


def test_main_completo_en_un_equipo_sin_ada_declara_python_prepara_los_datos_y_arranca(equipo_sin_ada, monkeypatch, capsys):
    """El recorrido real del doble clic (sin abrir navegador ni levantar el servidor de verdad). Atrapa el orden: el motor se declara DESPUÉS de importar ada_engine."""
    import uvicorn

    monkeypatch.setattr(abrir, "RAIZ", equipo_sin_ada)                            # una carpeta sin .env: el lanzador no lee el de este repositorio (que trae la API de Ada)
    arrancado = {}
    monkeypatch.setattr(uvicorn, "run", lambda app, **kw: arrancado.update(kw))
    monkeypatch.setattr(abrir, "_abrir_cuando_responda", lambda *a, **k: None)
    assert ada_engine.preferred() == "ada" and workspace.read_manifest() is None
    assert abrir.main(["--sin-navegador", "--puerto", "18999"]) == 0
    assert ada_engine.preferred() == "python"                                     # el panel lo rotula «Motor: Python local (sin Ada)»
    assert ada_engine.status()["mode"] == "python"
    man = workspace.read_manifest()
    assert man is not None and man["engine"] == "python-local"                    # los datos quedaron listos para el tablero
    assert arrancado == {"host": "127.0.0.1", "port": 18999, "log_level": "warning"}
    salida = capsys.readouterr().out
    assert "Python local (sin Ada)" in salida and "http://127.0.0.1:18999/#/tablero" in salida


def test_con_ada_en_el_equipo_el_lanzador_no_cambia_el_motor(equipo_sin_ada, monkeypatch):
    import uvicorn

    monkeypatch.setattr(abrir, "RAIZ", equipo_sin_ada)
    monkeypatch.setenv("ADA_REMOTE_URL", "https://ada.ejemplo.test")
    monkeypatch.setenv("ADA_REMOTE_KEY", "clave-de-prueba")
    monkeypatch.setattr(uvicorn, "run", lambda app, **kw: None)
    monkeypatch.setattr(abrir, "_abrir_cuando_responda", lambda *a, **k: None)
    assert abrir.main(["--sin-navegador", "--puerto", "18998"]) == 0
    assert ada_engine.preferred() == "ada" and workspace.read_manifest() is None


def test_con_ada_elegida_no_prepara_nada_por_su_cuenta(equipo_sin_ada):
    abrir.preparar_datos()                                                        # motor «ada»: la limpieza la decide la persona en el panel
    assert workspace.read_manifest() is None


# ----------------------------------------------------------------------------- los archivos de arranque cumplen lo prometido


def test_el_cmd_no_usa_powershell_y_tiene_finales_de_linea_de_windows():
    datos = (RAIZ / "Abrir CodePredict.cmd").read_bytes()
    assert datos.replace(b"\r\n", b"").count(b"\n") == 0 and b"\r\n" in datos     # sin LF sueltos: con ellos fallan las etiquetas en algunos cmd
    assert not datos.startswith(b"\xef\xbb\xbf")                                  # sin BOM
    texto = datos.decode("utf-8")
    ordenes = [ln for ln in texto.splitlines() if ln.strip() and not ln.lstrip().lower().startswith(("rem ", "echo"))]
    assert not any(re.search(r"powershell|pwsh|\.ps1|Set-ExecutionPolicy", ln, re.I) for ln in ordenes)
    assert "scripts\\abrir.py" in texto and "requirements.txt" in texto


def test_los_scripts_de_mac_y_linux_tienen_finales_de_linea_unix_y_arrancan_igual():
    for nombre in ("abrir_codepredict.sh", "Abrir CodePredict.command"):
        datos = (RAIZ / nombre).read_bytes()
        assert datos.startswith(b"#!/usr/bin/env bash") and b"\r" not in datos, nombre
    assert b"scripts/abrir.py" in (RAIZ / "abrir_codepredict.sh").read_bytes()


def test_requirements_txt_coincide_con_pyproject():
    def parsear(lineas):
        out = {}
        for ln in lineas:
            m = re.match(r"^([A-Za-z0-9_.\-]+)(?:\[[^\]]*\])?\s*>=\s*([\d.]+)\s*$", ln.strip())
            if m:
                out[m.group(1).lower().replace("_", "-")] = m.group(2)
        return out

    pyproject = tomllib.loads((RAIZ / "backend" / "pyproject.toml").read_text(encoding="utf-8"))["project"]["dependencies"]
    requisitos = (RAIZ / "backend" / "requirements.txt").read_text(encoding="utf-8").splitlines()
    assert parsear(pyproject) == parsear(requisitos) and len(parsear(pyproject)) >= 9
