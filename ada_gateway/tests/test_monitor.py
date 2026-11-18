"""Panel «Ada en vivo»: solo lectura, solo para este PC, sin huecos al leer la telemetría y sin cargar nada de internet."""
from __future__ import annotations

import json
import queue
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ada_gateway import telemetria  # noqa: E402,F401
from ada_gateway.monitor import app as panel, sistema  # noqa: E402

LOCAL = "http://127.0.0.1:8790"
ESTATICOS = Path(panel.ESTATICOS)


def linea(**kw) -> str:
    return json.dumps(kw, ensure_ascii=False) + "\n"


@pytest.fixture
def c():
    return TestClient(panel.app, base_url=LOCAL)


# ----------------------------------------------------------------------------- seguridad: solo este PC y solo lectura


def test_solo_responde_a_este_equipo_y_rechaza_otros_hosts(c):
    assert c.get("/api/eventos").status_code == 200
    ajeno = TestClient(panel.app, base_url="http://panel.ejemplo.test")                 # una página ajena que resolviera a 127.0.0.1 (DNS rebinding)
    assert ajeno.get("/api/eventos").status_code == 403 and ajeno.get("/").status_code == 403
    assert TestClient(panel.app, base_url="http://127.0.0.1:9999").get("/api/estado").status_code == 403


@pytest.mark.parametrize("metodo", ["post", "put", "delete", "patch"])
def test_es_de_solo_lectura(c, metodo):
    assert getattr(c, metodo)("/api/eventos").status_code == 405


def test_las_respuestas_no_se_guardan_en_cache_y_llevan_cabeceras_de_seguridad(c):
    r = c.get("/api/eventos")
    assert r.headers["cache-control"] == "no-store" and r.headers["x-content-type-options"] == "nosniff" and r.headers["referrer-policy"] == "no-referrer"


def test_la_pagina_no_carga_nada_de_internet():
    for nombre in ("index.html", "app.js", "logica.js", "estilo.css"):
        texto = (ESTATICOS / nombre).read_text(encoding="utf-8")
        externas = [u for u in re.findall(r"https?://[^\s\"')]+", texto) if "w3.org/2000/svg" not in u]
        assert externas == [], f"{nombre} no debe pedir nada fuera de este PC: {externas}"


def test_sirve_la_pagina_y_sus_archivos(c):
    r = c.get("/")
    assert r.status_code == 200 and "Ada en vivo" in r.text and r.headers["content-type"].startswith("text/html")
    assert "javascript" in c.get("/static/app.js").headers["content-type"] and "javascript" in c.get("/static/logica.js").headers["content-type"]
    assert c.get("/static/estilo.css").status_code == 200 and c.get("/static/../telemetria.py").status_code in (400, 404)


# ----------------------------------------------------------------------------- lectura de la telemetría


def test_el_historial_trae_los_ultimos_eventos_y_la_posicion_hasta_donde_leyo(c, telemetria_aislada):
    telemetria_aislada.mkdir(parents=True, exist_ok=True)
    f = telemetria_aislada / "eventos.jsonl"
    completas = "".join(linea(e="fin", id=f"{i:03d}", t=i) for i in range(10))
    with f.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(completas + '{"e":"fin","id":"parcial"')                              # la última línea está a medio escribir
    d = c.get("/api/eventos", params={"ultimos": 4}).json()
    assert [e["id"] for e in d["eventos"]] == ["006", "007", "008", "009"]
    assert d["posicion"] == len(completas.encode()), "la posición termina en la última línea completa"


def test_una_linea_danada_no_tumba_el_panel(c, telemetria_aislada):
    telemetria_aislada.mkdir(parents=True, exist_ok=True)
    (telemetria_aislada / "eventos.jsonl").write_text(linea(e="fin", id="a", t=1) + "esto no es json\n" + "[1,2,3]\n" + linea(e="fin", id="b", t=2), encoding="utf-8")
    assert [e["id"] for e in c.get("/api/eventos").json()["eventos"]] == ["a", "b"]


def test_sin_archivo_el_panel_responde_vacio(c):
    d = c.get("/api/eventos").json()
    assert d["eventos"] == [] and d["posicion"] == 0


def test_seguir_desde_la_posicion_no_deja_huecos_ni_repite(telemetria_aislada):
    telemetria_aislada.mkdir(parents=True, exist_ok=True)
    f = telemetria_aislada / "eventos.jsonl"
    f.write_text(linea(e="fin", id="1", t=1), encoding="utf-8")
    ev, pos = panel.historial()
    assert [e["id"] for e in ev] == ["1"]
    nada, pos2 = panel.nuevos(f, pos)
    assert nada == [] and pos2 == pos
    with f.open("a", encoding="utf-8") as fh:
        fh.write(linea(e="fin", id="2", t=2) + '{"e":"fin","id":"3"')                # una completa y otra a medias
    ev2, pos3 = panel.nuevos(f, pos2)
    assert [e["id"] for e in ev2] == ["2"]
    with f.open("a", encoding="utf-8") as fh:
        fh.write(',"t":3}\n')                                                        # la segunda se termina de escribir
    ev3, _ = panel.nuevos(f, pos3)
    assert [e["id"] for e in ev3] == ["3"]


def test_si_el_archivo_se_archiva_el_panel_vuelve_a_empezar(telemetria_aislada):
    telemetria_aislada.mkdir(parents=True, exist_ok=True)
    f = telemetria_aislada / "eventos.jsonl"
    f.write_text("".join(linea(e="fin", id=str(i), t=i) for i in range(20)), encoding="utf-8")
    _, pos = panel.historial()
    f.write_text(linea(e="fin", id="nuevo", t=99), encoding="utf-8")                  # el archivo quedó más corto: se archivó y se empezó otro
    ev, _ = panel.nuevos(f, pos)
    assert [e["id"] for e in ev] == ["nuevo"]


def test_el_historial_se_completa_con_el_archivo_anterior(telemetria_aislada):
    telemetria_aislada.mkdir(parents=True, exist_ok=True)
    (telemetria_aislada / "eventos.1.jsonl").write_text("".join(linea(e="fin", id=f"v{i}", t=i) for i in range(5)), encoding="utf-8")
    (telemetria_aislada / "eventos.jsonl").write_text(linea(e="fin", id="n0", t=10) + linea(e="fin", id="n1", t=11), encoding="utf-8")
    ev, _ = panel.historial(5)
    assert [e["id"] for e in ev] == ["v2", "v3", "v4", "n0", "n1"]


# ----------------------------------------------------------------------------- flujo en vivo (Server-Sent Events)


def test_el_flujo_entrega_cada_evento_nuevo_y_el_estado_sin_repetir_lo_anterior(c, telemetria_aislada, monkeypatch):
    monkeypatch.setattr(sistema, "estado", lambda: {"t": 1.0, "puerta": {"activa": True}})
    telemetria_aislada.mkdir(parents=True, exist_ok=True)
    f = telemetria_aislada / "eventos.jsonl"
    f.write_text(linea(e="fin", id="viejo", t=1), encoding="utf-8")
    desde = f.stat().st_size
    cola: queue.Queue[str] = queue.Queue()

    def leer():
        with c.stream("GET", "/api/flujo", params={"desde": desde}) as r:
            assert r.headers["content-type"].startswith("text/event-stream")
            vio_evento = False
            for l in r.iter_lines():
                cola.put(l)
                vio_evento = vio_evento or l == "event: evento"
                if vio_evento and l.startswith("data:"):      # ya llegó el evento completo (nombre y datos)
                    break

    hilo = threading.Thread(target=leer, daemon=True)
    hilo.start()
    time.sleep(0.8)
    with f.open("a", encoding="utf-8") as fh:
        fh.write(linea(e="inicio", id="nuevo", t=2, ruta="/v1/stats/bayes"))
    hilo.join(timeout=10)
    vistas = []
    while not cola.empty():
        vistas.append(cola.get())
    assert "event: estado" in vistas and "event: evento" in vistas, vistas
    assert not any("viejo" in l for l in vistas), "lo anterior a la posición no se repite"


# ----------------------------------------------------------------------------- lecturas del sistema: si algo falla, se dice (no se inventa)


def test_sin_gpu_nvidia_el_panel_lo_dice_en_vez_de_inventar(monkeypatch):
    def falla(*a, **k):
        raise FileNotFoundError("nvidia-smi")

    monkeypatch.setattr(subprocess, "run", falla)
    assert sistema.gpu() is None


def test_la_gpu_se_lee_de_nvidia_smi(monkeypatch):
    salida = subprocess.CompletedProcess([], 0, stdout="NVIDIA GeForce RTX 5070, 5, 533, 12227, 45, 23.18, 250.00, 525\n")
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: salida)
    g = sistema.gpu()
    assert g == {"nombre": "NVIDIA GeForce RTX 5070", "uso": 5.0, "vram_usada_mb": 533.0, "vram_total_mb": 12227.0, "temp_c": 45.0, "potencia_w": 23.18, "potencia_max_w": 250.0, "reloj_mhz": 525.0}


def test_ollama_y_la_puerta_apagados_se_reportan_como_apagados(monkeypatch):
    def cae(*a, **k):
        raise httpx.ConnectError("sin conexión")

    monkeypatch.setattr(sistema.httpx, "get", cae)
    assert sistema.ollama() == {"activo": False, "modelos": []} and sistema.puerta() == {"activa": False, "motor": None}


def test_ollama_informa_el_modelo_cargado_y_la_puerta_su_motor(monkeypatch):
    def respuesta(url, **k):
        if url.endswith("/api/ps"):
            return httpx.Response(200, json={"models": [{"name": "ada-q", "size_vram": 9_000_000_000, "expires_at": "2026-11-17T10:00:00Z"}]}, request=httpx.Request("GET", url))
        return httpx.Response(200, json={"status": "ok", "motor": "listo"}, request=httpx.Request("GET", url))

    monkeypatch.setattr(sistema.httpx, "get", respuesta)
    assert sistema.ollama() == {"activo": True, "modelos": [{"nombre": "ada-q", "vram_mb": 9000, "hasta": "2026-11-17T10:00:00Z"}]}
    assert sistema.puerta() == {"activa": True, "motor": "listo"}


def test_los_cupos_usan_las_mismas_variables_que_la_puerta_de_enlace(monkeypatch):
    assert sistema.limites() == {"explicar": 10, "stats": 120, "pendulo": 240, "cp": 60, "cp_limpio": 10}
    monkeypatch.setenv("GATEWAY_RATE_PER_MIN", "3")
    assert sistema.limites()["explicar"] == 3


def test_el_estado_real_de_este_pc_tiene_la_forma_que_espera_la_pagina(c):
    d = c.get("/api/estado").json()
    assert set(d) >= {"t", "puerta", "tunel", "ollama", "gpu", "pc", "limites"}
    assert d["pc"]["ram_total_mb"] > 0 and 0 <= d["pc"]["cpu"] <= 100 and isinstance(d["tunel"]["activo"], bool)
