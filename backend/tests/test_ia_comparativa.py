"""«IA frente a personas»: tasas, intervalos de Wilson, razones y d de Cohen calculados a mano; y los datos reales contra los archivos originales del artefacto."""
from __future__ import annotations

import math
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from scipy import stats

from app.core import ia_comparativa as ia
from app.main import app

RAIZ = Path(__file__).resolve().parents[2]
EXTRAIDO = RAIZ / "data" / "external" / "ia_cotroneo_2025" / "extraido" / "6_Results"


def _fuente(defectuosas: int, alertas: int, vulnerables: int, ccn: float, nloc: float = 10.0, sd_ccn: float = 2.0, funciones: int = 1000) -> dict:
    est = lambda m, sd: {"media": m, "min": 1, "max": 99, "sd": sd}  # noqa: E731
    return {"defectos": {"total": alertas, "muestras_defectuosas": defectuosas, "por_muestra": alertas / defectuosas, "odc": {"Algorithm": alertas - 10, "Timing": 10}, "top_reglas": []},
            "vulnerabilidades": {"funciones": vulnerables, "problemas": vulnerables * 2, "cwe_distintos": 3, "top_cwe": []},
            "complejidad": {"funciones": funciones, "NLOC": est(nloc, 5.0), "CCN": est(ccn, sd_ccn), "TOKEN_COUNT": est(80.0, 40.0)}}


def _datos() -> dict:
    """1 000 muestras por lenguaje. Defectuosas: personas 300 · ChatGPT 150 · DSC 600 · Qwen 300. Vulnerables: 50 · 100 · 200 · 50. CCN media: 4 · 2 · 1 · 3."""
    por = {"human": _fuente(300, 900, 50, 4.0, nloc=12.0), "chatgpt": _fuente(150, 300, 100, 2.0, nloc=6.0), "dsc": _fuente(600, 1800, 200, 1.0, nloc=5.0), "qwen": _fuente(300, 600, 50, 3.0, nloc=8.0)}
    return {"meta": {"titulo": "T", "autores": ["A B", "C D"], "anio": 2025, "congreso": "X", "arxiv": "1", "zenodo_artefacto": "10.1/x", "licencia": "CC BY 4.0", "descargado": "2026-11-23",
                     "md5_zip": "0" * 32, "nota": "n", "fuentes": {"human": "Personas", "chatgpt": "ChatGPT", "dsc": "DeepSeek", "qwen": "Qwen"},
                     "herramientas": {"defectos_java": "PMD", "defectos_python": "Pylint", "vulnerabilidades": "Semgrep", "complejidad": "Lizard"}},
            "lenguajes": {lid: {"muestras": 1000, "repositorios": 10, "tokens_docstring": 20.0, "fuentes": por} for lid in ("java", "python")}}


# ----------------------------------------------------------------------------- el intervalo de Wilson y la d de Cohen


@pytest.mark.parametrize("k,n", [(300, 1000), (1, 50), (49, 50), (76049, 221795), (0, 20), (20, 20)])
def test_wilson_coincide_con_scipy(k, n):
    lo, hi = ia.wilson(k, n)
    ref = stats.binomtest(k, n).proportion_ci(confidence_level=0.95, method="wilson")
    assert lo == pytest.approx(ref.low, abs=1e-12) and hi == pytest.approx(ref.high, abs=1e-12)
    assert 0 <= lo <= k / n <= hi <= 1


def test_wilson_rechaza_datos_imposibles():
    for k, n in ((5, 0), (-1, 10), (11, 10)):
        with pytest.raises(ValueError):
            ia.wilson(k, n)


def test_d_de_cohen_a_mano():
    assert ia.d_de_cohen(5, 2, 11, 3, 2, 11) == pytest.approx(1.0)                         # misma desviación 2 y diferencia 2 → d = 1
    sp = math.sqrt((9 * 4 + 19 * 9) / 28)                                                   # n₁ = 10 (sd 2), n₂ = 20 (sd 3)
    assert ia.d_de_cohen(7, 2, 10, 4, 3, 20) == pytest.approx(3 / sp)


# ----------------------------------------------------------------------------- la comparación con cifras sencillas


def test_tasas_razones_y_diferencias_con_cifras_a_mano():
    r = ia.comparativa(_datos())["lenguajes"]["java"]
    f = {x["id"]: x for x in r["fuentes"]}
    assert [x["id"] for x in r["fuentes"]] == ["human", "chatgpt", "dsc", "qwen"] and f["human"]["es_persona"] and f["human"]["vs_personas"] is None
    assert f["human"]["defectos"]["tasa"] == pytest.approx(0.30) and f["dsc"]["defectos"]["tasa"] == pytest.approx(0.60)
    assert f["dsc"]["vs_personas"]["defectos"] == {"dif_pp": pytest.approx(30.0), "razon": pytest.approx(2.0)}
    assert f["chatgpt"]["vs_personas"]["vulnerabilidades"]["razon"] == pytest.approx(2.0) and f["qwen"]["vs_personas"]["vulnerabilidades"]["dif_pp"] == pytest.approx(0.0)
    assert f["chatgpt"]["vs_personas"]["ccn"]["dif"] == pytest.approx(-2.0) and f["chatgpt"]["vs_personas"]["ccn"]["d_cohen"] == pytest.approx(-1.0)   # sd 2 en ambos
    assert f["human"]["defectos"]["por_muestra_defectuosa"] == pytest.approx(3.0)       # 900 alertas / 300 muestras defectuosas
    assert f["dsc"]["vs_personas"]["nloc"]["razon"] == pytest.approx(5 / 12)
    assert f["human"]["defectos"]["ic95"][0] < 0.30 < f["human"]["defectos"]["ic95"][1]
    assert sum(o["parte"] for o in f["human"]["odc"]) == pytest.approx(1.0) and f["human"]["odc"][0]["tipo"] == "Algorithm"


def test_la_lectura_dice_quien_tuvo_la_tasa_mas_alta_y_la_mas_baja_sin_afirmar_causas():
    textos = {x["metrica"]: x["texto"] for x in ia.comparativa(_datos())["lenguajes"]["python"]["lectura"]}
    assert "ChatGPT (15,0 %)" in textos["defectos"] and "DeepSeek (60,0 %)" in textos["defectos"] and "las personas, 30,0 %" in textos["defectos"]
    assert "DeepSeek 1,00" in textos["complejidad"] and "las personas, 4,00" in textos["complejidad"]
    assert not any(p in " ".join(textos.values()).lower() for p in ("porque", "causa", "mejor", "peor"))


def test_los_limites_estan_siempre_presentes():
    r = ia.comparativa(_datos())
    assert len(r["limites"]) >= 5 and any("análisis estático" in t for t in r["limites"]) and any("no se mezclan" in t for t in r["limites"])
    assert r["meta"]["cita"].startswith("A B, C D (2025)") and "arXiv:1" in r["meta"]["cita"]


# ----------------------------------------------------------------------------- los datos reales


def test_los_datos_reales_tienen_la_huella_del_zip_publicado_y_las_cifras_conocidas():
    assert ia.cargar()["meta"]["md5_zip"] == "52e11ee0b6c5aefebab5c375d49231e4"
    r = ia.comparativa()["lenguajes"]
    assert r["java"]["muestras"] == 221795 and r["python"]["muestras"] == 285249
    h = next(f for f in r["java"]["fuentes"] if f["es_persona"])
    assert h["defectos"]["k"] == 76049 and h["defectos"]["alertas"] == 202129 and h["complejidad"]["CCN"]["media"] == 3.48 and h["vulnerabilidades"]["k"] == 6660
    assert h["defectos"]["por_muestra_defectuosa"] == pytest.approx(2.66, abs=0.005)       # el archivo original dice 2,66


@pytest.mark.skipif(not EXTRAIDO.is_dir(), reason="la carpeta extraída del artefacto no está en este equipo")
def test_cada_cifra_coincide_con_el_archivo_original_leido_por_otra_via():
    """Segunda vía: lee los .txt originales con expresiones sueltas (sin el lector del script) y compara todo lo que se muestra."""
    r = ia.comparativa()["lenguajes"]
    for lid, leng in (("java", "Java"), ("python", "Python")):
        for f in r[lid]["fuentes"]:
            clave = f["id"].lower()
            arch = next(p for p in (EXTRAIDO / lid / "defects").glob(f"{leng}_*.txt") if p.stem.split("_", 1)[1].lower() == clave)
            t = arch.read_text(encoding="utf-8", errors="replace")
            assert f["defectos"]["k"] == int(re.search(r"defective samples:\s*(\d+)", t).group(1)), arch.name
            assert f["defectos"]["alertas"] == int(re.search(r"Total number of defects:\s*(\d+)", t).group(1)), arch.name
            seg = next(p for p in (EXTRAIDO / lid / "vulnerabilities").glob(f"{leng}_Security_*.txt") if p.stem.rsplit("_", 1)[1].lower() == clave)
            ts = seg.read_text(encoding="utf-8", errors="replace")
            assert f["vulnerabilidades"]["k"] == int(re.search(r"functions \(excluding errors\):\s*(\d+)", ts).group(1)), seg.name
            comp = (EXTRAIDO / lid / "complexity" / f"{leng}_COMPLEXITY.txt").read_text(encoding="utf-8")
            bloque = comp.split(f"Stats for {clave}_code")[1].split("\n\n")[0]
            assert float(re.search(r"CCN\s*\|\s*Avg:\s*([\d.]+)", bloque).group(1)) == f["complejidad"]["CCN"]["media"], (lid, clave)


# ----------------------------------------------------------------------------- la ruta


def test_la_ruta_entrega_los_dos_lenguajes_con_las_cuatro_fuentes():
    r = TestClient(app).get("/api/ia/comparativa")
    assert r.status_code == 200
    d = r.json()                                  # si hubiera un NaN, la respuesta no sería JSON válido y esta línea fallaría
    assert set(d["lenguajes"]) == {"java", "python"} and all(len(l["fuentes"]) == 4 for l in d["lenguajes"].values())
    assert d["lenguajes"]["java"]["herramienta_defectos"] == "PMD" and d["lenguajes"]["python"]["herramienta_defectos"] == "Pylint"
    assert d["meta"]["licencia"] == "CC BY 4.0" and d["limites"]
