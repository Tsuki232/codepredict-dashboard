"""Cuaderno celda por celda: orden, estado, invalidación y que muestre el código real. Usa las 10 filas de conftest (resultados a mano)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core import notebook


@pytest.fixture
def client(env):
    from app.main import app

    notebook.reset()
    return TestClient(app)


def run(client, cell, **extra):
    return client.post("/api/notebook/run", json={"cell_id": cell, **extra})


def test_catalogo_trae_el_codigo_real_de_cada_celda(client):
    cells = client.get("/api/notebook/cells").json()["cells"]
    ids = [c["id"] for c in cells]
    assert ids[:3] == ["cargar", "integridad", "duplicados"] and ids[-1] == "bayes"
    code = {c["id"]: c["code"] for c in cells}
    assert "def rule_integrity" in code["integridad"] and "SELECT count(*)" in code["integridad"]   # regla + SQL de DuckDB
    assert "def rule_exact_duplicates" in code["duplicados"]
    assert "def compare" not in code["welch"] and "compare_two_groups" in code["welch"]              # llama a Ada


def test_no_se_puede_saltar_una_celda(client):
    r = run(client, "integridad")
    assert r.status_code == 409 and "Cargar el CSV" in r.json()["detail"]
    assert run(client, "cargar").status_code == 200
    assert run(client, "duplicados").status_code == 409  # falta «Integridad»


def test_recorrido_de_limpieza_coincide_con_los_conteos_a_mano(client):
    out = {}
    for cell in ("cargar", "integridad", "duplicados", "rutas", "constantes", "atipicos", "etiquetas", "tabla"):
        r = run(client, cell)
        assert r.status_code == 200, r.text
        out[cell] = r.json()
    st = lambda c: out[c]["blocks"][0]["step"]
    assert (st("integridad")["before"], st("integridad")["after"]) == (10, 9)      # fila 9: LOC < LLOC
    assert st("duplicados")["removed"] == 1 and st("rutas")["removed"] == 1       # fila 5 (copia) y fila 6 (ruta repetida)
    assert st("constantes")["after"] == 7 and st("etiquetas")["detail"]["defectuosos"] == 4
    assert st("integridad")["verified"] is True                                   # pandas = DuckDB
    quitadas = out["integridad"]["blocks"][1]
    assert quitadas["type"] == "table" and quitadas["rows"][0][0] == "L9"        # muestra QUÉ fila quitó
    tabla = out["tabla"]["blocks"][0]["rows"]
    assert tabla[0][1:3] == [3, 1] and tabla[1][1:3] == [1, 2]                    # C∩D=3, C∩¬D=1, ¬C∩D=1, ¬C∩¬D=2
    assert [out[c]["execution_count"] for c in out] == list(range(1, 9))          # contador [n] como en Colab


def test_reejecutar_una_celda_invalida_las_posteriores(client):
    for cell in ("cargar", "integridad", "duplicados"):
        run(client, cell)
    r = run(client, "integridad", json=None)
    assert r.status_code == 200 and r.json()["invalidated"] == ["duplicados"]
    assert run(client, "rutas").status_code == 409                                 # «Duplicados» quedó desactualizada


def test_reiniciar_deja_todo_desde_cero(client):
    run(client, "cargar")
    assert client.post("/api/notebook/reset").json()["done"] == {}
    assert run(client, "integridad").status_code == 409


def test_regla_desactivada_no_cambia_nada(client):
    run(client, "cargar")
    r = run(client, "integridad", rules={"integrity": False})
    assert r.status_code == 200 and "desactivada" in r.json()["blocks"][0]["text"]
    assert run(client, "duplicados").json()["blocks"][0]["step"]["before"] == 10


def test_las_celdas_de_inferencia_ya_no_necesitan_ada(client):
    """Ada solo limpia: las celdas de estadística se ejecutan con Python local, sin Ada (nunca 503 por Ada)."""
    for cell in ("cargar", "integridad", "duplicados", "rutas", "constantes", "atipicos", "etiquetas", "tabla", "guardar"):
        assert run(client, cell).status_code == 200
    assert run(client, "welch").status_code != 503
    assert all(not c["needs_ada"] for c in client.get("/api/notebook/cells").json()["cells"])
