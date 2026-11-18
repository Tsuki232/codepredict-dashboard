"""Las pruebas de la puerta de enlace NUNCA escriben en la telemetría real de este PC (la que lee el panel «Ada en vivo»)."""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def telemetria_aislada(tmp_path, monkeypatch):
    monkeypatch.setenv("GATEWAY_TELEMETRIA_DIR", str(tmp_path / "telemetria"))
    return tmp_path / "telemetria"
