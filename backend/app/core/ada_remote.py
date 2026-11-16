"""Ada REMOTA: las mismas funciones estadísticas que `ada.stats`, pero calculadas por la API de Ada (puerta de enlace) en otro equipo.

Sirve cuando Ada no está instalada en este PC. Tiene la misma forma que los módulos locales (`inference`, `probability`), así que el resto del
panel no cambia. Los cálculos NO se hacen aquí: se envían los datos, Ada los calcula con doble verificación y devuelve el resultado.
La clave solo viaja en la cabecera `X-API-Key` y nunca aparece en un mensaje de error.
"""
from __future__ import annotations

import operator
from types import SimpleNamespace
from typing import Any, Callable

import httpx
import numpy as np

TIMEOUT_S = 90.0
_OPS: dict[str, Callable[[Any, Any], Any]] = {">": operator.gt}   # la API de Ada solo ofrece eventos «columna > umbral»


def _numero(v: Any) -> int | float:
    """Número de Python (no de numpy) que conserva si era entero o decimal."""
    return v.item() if hasattr(v, "item") else v


class Resultado(dict):
    """Resultado completo de Ada, con su versión compacta (la calculó Ada; aquí no se recalcula nada)."""

    compact: dict[str, Any]


class _Cliente:
    def __init__(self, url: str, clave: str, no_listo: type[Exception]):
        self._url, self._clave, self._no_listo = url.rstrip("/"), clave, no_listo

    def post(self, ruta: str, cuerpo: dict[str, Any]) -> Resultado:
        try:
            with httpx.Client(timeout=TIMEOUT_S) as c:
                r = c.post(f"{self._url}{ruta}", json=cuerpo, headers={"X-API-Key": self._clave})
        except httpx.HTTPError:
            raise self._no_listo("Ada remota no responde: el PC que corre Ada puede estar apagado o sin túnel.") from None
        if r.status_code == 401:
            raise self._no_listo("Ada remota rechazó la clave: revisa ADA_REMOTE_KEY en el archivo .env.")
        if r.status_code != 200:
            try:
                detalle = r.json().get("detail", "error")
            except ValueError:
                detalle = "error"
            if r.status_code == 422:
                raise ValueError(f"Ada remota rechazó los datos: {detalle}")      # los endpoints ya traducen ValueError a 422
            raise self._no_listo(f"Ada remota respondió {r.status_code}: {detalle}")
        d = r.json()
        res = Resultado(d.get("result") or {})
        res.compact = d["compact"]
        return res


class _Inferencia:
    def __init__(self, cli: _Cliente):
        self._c = cli

    def compare_two_groups(self, x, y, method: str = "auto", alternative: str = "two-sided", alpha: float = 0.05, sensitivity: bool = True, **_ignored) -> Resultado:
        return self._c.post("/v1/stats/dos_grupos", {"x": np.asarray(x, float).tolist(), "y": np.asarray(y, float).tolist(), "method": method,
                                                     "alternative": alternative, "alpha": alpha, "sensitivity": bool(sensitivity)})

    def chi_square_independence(self, table, alpha: float = 0.05, **_ignored) -> Resultado:
        return self._c.post("/v1/stats/chi_cuadrado", {"table": [[int(v) for v in fila] for fila in table], "alpha": alpha})

    def two_proportions(self, successes, nobs, alpha: float = 0.05, **_ignored) -> Resultado:
        return self._c.post("/v1/stats/dos_proporciones", {"successes": [int(v) for v in successes], "nobs": [int(v) for v in nobs], "alpha": alpha})

    @staticmethod
    def compact_result(res: Resultado) -> dict[str, Any]:
        return dict(res.compact)


class _Probabilidad:
    def __init__(self, cli: _Cliente):
        self._c = cli

    def run_probability(self, kind: str, df, A: dict[str, Any], B: dict[str, Any], **_ignored) -> Resultado:
        """Teorema de Bayes P(A|B): se cuentan aquí las cuatro casillas (A y B son eventos «columna > umbral») y Ada hace el cálculo y su verificación."""
        if kind != "bayes":
            raise ValueError("Ada remota solo ofrece el teorema de Bayes en este panel.")
        for ev in (A, B):
            if ev.get("op") not in _OPS:
                raise ValueError(f"Ada remota solo admite eventos con '>' (recibido: {ev.get('op')!r}).")
        # Los nombres de columna de la API son fijos: bug (evento A) y McCC (evento B).
        if A["column"] != "bug" or B["column"] != "McCC":
            raise ValueError("Ada remota espera A = bug y B = McCC en este panel.")
        d = _OPS[A["op"]](df[A["column"]], A["value"]).to_numpy(bool)
        c = _OPS[B["op"]](df[B["column"]], B["value"]).to_numpy(bool)
        return self._c.post("/v1/stats/bayes", {"C_D": int((c & d).sum()), "C_ND": int((c & ~d).sum()), "NC_D": int((~c & d).sum()), "NC_ND": int((~c & ~d).sum()),
                                                "bug_threshold": _numero(A["value"]), "mccc_threshold": _numero(B["value"])})

    @staticmethod
    def compact_probability(res: Resultado) -> dict[str, Any]:
        return dict(res.compact)


def construir(url: str, clave: str, no_listo: type[Exception]) -> SimpleNamespace:
    """Módulos con la misma forma que los de Ada local. `ledger` no existe en remoto: la auditoría escribe archivos y eso solo lo hace Ada en este equipo."""
    cli = _Cliente(url, clave, no_listo)

    def sin_auditoria(_ruta):
        raise no_listo("Con Ada remota no se escribe la auditoría local (el registro lo lleva el PC que corre Ada).")

    return SimpleNamespace(inference=_Inferencia(cli), probability=_Probabilidad(cli), ledger=None, assert_safe_write_path=sin_auditoria)
