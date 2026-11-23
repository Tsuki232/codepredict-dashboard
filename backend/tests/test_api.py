"""Pruebas de la API con un CSV temporal. Verifican también que el CSV de entrada NUNCA se modifica."""
from __future__ import annotations

import hashlib
import json
import time

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.core import ada_engine, config, workspace
from app.core.cleaning import Rules
from tests.conftest import COLS, table_rows


def sha(p) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


@pytest.fixture
def client(env):
    from app.main import app

    return TestClient(app)


def test_health(client, env):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and r["dataset"]["exists"] is True


def test_perfil_cuenta_lo_que_hay_en_el_csv(client):
    p = client.get("/api/dataset/profile").json()
    assert p["rows"] == 10 and p["exact_duplicates"] == 1
    assert p["rows_with_repeated_path"] == 2           # 10 filas − 8 rutas distintas
    assert p["integrity"]["loc_menor_que_lloc"] == 1
    assert p["constant_columns"] == ["CLOC", "PDA", "PUA"]
    assert len(p["source"]["sha256"]) == 64


def test_vista_previa_no_escribe_nada(client, env):
    before = sha(env["src"])
    r = client.post("/api/clean/preview", json={}).json()
    assert r["rows_out"] == 7 and r["verified"] is True and len(r["impact"]) == 9
    assert r["table2x2"] == {"C_D": 3, "C_ND": 1, "NC_D": 1, "NC_ND": 2}
    assert not env["work"].exists()                    # la vista previa no crea archivos
    assert sha(env["src"]) == before


def test_aplicar_guarda_limpio_con_huellas_y_no_toca_la_entrada(client, env):
    before = sha(env["src"])
    r = client.post("/api/clean/apply", json={"path_policy": "keep_first", "outlier_policy": "tukey3"})
    assert r.status_code == 200, r.text
    man = r.json()
    out = env["work"] / workspace.CLEAN_NAME
    assert out.is_file() and man["output"]["sha256"] == sha(out) and man["input"]["sha256"] == before
    assert man["output"]["rows"] == 6                  # 7 filas − el atípico L10
    assert sha(env["src"]) == before                   # la entrada sigue idéntica
    assert json.loads((env["work"] / workspace.MANIFEST_NAME).read_text(encoding="utf-8"))["rules"]["outlier_policy"] == "tukey3"
    assert "skipped" in man["audit"]                   # Ada no estaba cargada en esta prueba: se dice, no se oculta
    st = client.get("/api/clean/status").json()
    assert st["applied"] is True
    frame, _ = workspace.load_clean()
    assert list(frame.columns)[-2:] == ["defectuoso", "compleja"] and len(frame) == 6


def test_cambiar_el_limpio_a_mano_se_detecta(client, env):
    client.post("/api/clean/apply", json={})
    out = env["work"] / workspace.CLEAN_NAME
    out.write_text(out.read_text(encoding="utf-8") + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="SHA-256"):
        workspace.load_clean()


def test_inferencia_sin_limpieza_pide_limpiar_primero(client):
    r = client.post("/api/inference", json={})
    assert r.status_code == 409 and "limpieza" in r.json()["detail"].lower()


def test_la_inferencia_ya_no_necesita_ada(client):
    """Ada solo limpia: la estadística es Python local (sin Ada ni ninguna IA), así que funciona aunque Ada no esté."""
    client.post("/api/clean/apply", json={})
    r = client.post("/api/inference", json={})
    assert r.status_code in (200, 422), r.text            # 422 solo si la muestra mínima de prueba no alcanza para los dos grupos; nunca 503 por Ada
    if r.status_code == 200:
        assert r.json()["meta"]["ada"]["mode"] == "python" and "sin Ada" in r.json()["meta"]["ada"]["note"]


def test_reglas_invalidas_se_rechazan(client):
    assert client.post("/api/clean/preview", json={"path_policy": "inventada"}).status_code == 422


def test_guarda_de_escritura_bloquea_raw_y_rutas_ajenas(env):
    with pytest.raises(config.UnsafeWritePath):
        config.assert_safe_output(env["tmp"] / "data" / "raw" / "x.csv")
    with pytest.raises(config.UnsafeWritePath):
        config.assert_safe_output(env["tmp"] / "otra_carpeta" / "x.csv")
    assert config.assert_safe_output(env["work"] / "ok.csv")


@pytest.fixture
def ada_real(monkeypatch):
    """Carga Ada de verdad (tarda ~20 s la primera vez). Se omite si Ada no está en esta máquina."""
    monkeypatch.undo()  # quita el reemplazo de `require`
    ada_engine.start_loading()
    t0 = time.time()
    while ada_engine.status()["phase"] == "loading" and time.time() - t0 < 180:
        time.sleep(0.5)
    if not ada_engine.status()["ready"]:
        pytest.skip(f"Ada no disponible: {ada_engine.status()['error']}")


def test_inferencia_con_ada_coincide_con_la_mano(tmp_path, monkeypatch, ada_real):
    """Tabla 2×2 con n = 100: C∩D=30, C∩¬D=20, ¬C∩D=10, ¬C∩¬D=40 (McCC vale 20 o 2).
    Esperados: 20, 30, 20, 30 → χ² = 100/20 + 100/30 + 100/20 + 100/30 = 50/3 ≈ 16.6667 con 1 g.l.
    Proporciones 0.6 y 0.2, conjunta 0.4: z = 0.4 / √(0.4·0.6·(1/50 + 1/50)) = √(50/3) ≈ 4.0825. Bayes: P(D|C) = 30/50 = 0.6."""
    from app.core import inference

    src = tmp_path / "in" / "Unified-file.csv"
    src.parent.mkdir()
    pd.DataFrame(table_rows(), columns=COLS).to_csv(src, index=False)
    monkeypatch.setenv("CODEPREDICT_DATASET", str(src))
    monkeypatch.setenv("CODEPREDICT_WORK", str(tmp_path / "work" / "codepredict"))
    workspace.apply_cleaning(Rules(drop_constant_columns=False))

    r = inference.run(0.05, "two-sided")
    assert r["table2x2"] == {"C_D": 30, "C_ND": 20, "NC_D": 10, "NC_ND": 40}
    chi = r["chi_square"]
    assert chi["statistic"] == pytest.approx(50 / 3, abs=1e-4) and chi["df"] == 1 and chi["verified"] is True
    z = r["two_proportions"]
    assert abs(z["statistic"]) == pytest.approx((50 / 3) ** 0.5, abs=1e-4) and z["verified"] is True
    assert r["bayes"]["posterior"] == pytest.approx(0.6, abs=1e-9) and r["bayes"]["verified"] is True
    # Welch a mano: grupo con bug = 30 veces 20 y 10 veces 2; grupo sin bug = 20 veces 20 y 40 veces 2
    import math
    x = [20] * 30 + [2] * 10
    y = [20] * 20 + [2] * 40
    mx, my = sum(x) / 40, sum(y) / 60
    vx = sum((v - mx) ** 2 for v in x) / 39
    vy = sum((v - my) ** 2 for v in y) / 59
    se2 = vx / 40 + vy / 60
    t_hand = (mx - my) / math.sqrt(se2)
    df_hand = se2**2 / ((vx / 40) ** 2 / 39 + (vy / 60) ** 2 / 59)
    w = r["welch"]
    assert w["statistic"] == pytest.approx(t_hand, rel=1e-5) and w["df"] == pytest.approx(df_hand, rel=1e-5)
    assert w["verified"] is True and r["robust"]["verified"] is True
    assert 0.5 < r["robust"]["effect_size"]["value"] < 1


def test_descargas_solo_de_los_dos_archivos_fijos(client, env):
    assert client.get("/api/files/manifest.json").status_code == 404           # aún no hay limpio guardado
    client.post("/api/clean/apply", json={})
    m = client.get("/api/files/manifest.json")
    assert m.status_code == 200 and m.json()["output"]["rows"] == 7
    c = client.get("/api/files/unified_file_limpio.csv")
    assert c.status_code == 200 and c.content.startswith(b"ID,Name,LongName")
    assert hashlib.sha256(c.content).hexdigest() == m.json()["output"]["sha256"]
    for evil in ("..%2F..%2Fsecret.txt", "Unified-file.csv", "x.csv"):
        assert client.get(f"/api/files/{evil}").status_code == 404


def test_inferencia_en_vivo_coincide_con_la_guardada_y_con_la_mano(tmp_path, monkeypatch, ada_real):
    """Mismo caso de 100 archivos: la vista en vivo (sin guardar) debe dar lo mismo que el conjunto guardado."""
    from app.core import inference

    src = tmp_path / "in" / "Unified-file.csv"
    src.parent.mkdir()
    pd.DataFrame(table_rows(), columns=COLS).to_csv(src, index=False)
    monkeypatch.setenv("CODEPREDICT_DATASET", str(src))
    monkeypatch.setenv("CODEPREDICT_WORK", str(tmp_path / "work" / "codepredict"))
    rules = Rules(drop_constant_columns=False)

    live = inference.run_live(rules, 0.05, "two-sided")
    assert live["meta"]["source"].startswith("vista en vivo") and live["meta"]["matches_saved"] is False   # todavía no hay guardado
    assert live["chi_square"]["statistic"] == pytest.approx(50 / 3, abs=1e-4)                                # χ² = 50/3 calculado a mano
    assert live["bayes"]["posterior"] == pytest.approx(0.6)

    workspace.apply_cleaning(rules)
    saved = inference.run(0.05, "two-sided")
    for k in ("welch", "chi_square", "two_proportions", "table2x2"):
        assert live[k] == saved[k]                                                                            # idénticos, no solo parecidos
    inference._live_cached.cache_clear()
    assert inference.run_live(rules, 0.05, "two-sided")["meta"]["matches_saved"] is True
    assert inference.run_live(Rules(drop_constant_columns=False, outlier_policy="p999"), 0.05, "two-sided")["meta"]["matches_saved"] is False
