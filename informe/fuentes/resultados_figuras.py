"""Figuras de la sección de resultados (matplotlib, Times New Roman, escala de grises + un color de acento). Lee resultados_cifras.json."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).parent
OUT = HERE / "figuras"
OUT.mkdir(exist_ok=True)
R = json.loads((HERE / "resultados_cifras.json").read_text(encoding="utf-8"))

plt.rcParams.update({
    "font.family": "serif", "font.serif": ["Times New Roman"], "mathtext.fontset": "stix", "font.size": 11,
    "axes.spines.top": False, "axes.spines.right": False, "figure.dpi": 100, "savefig.dpi": 300,
})
INK, BLUE, ORANGE, GREY, LIGHT = "#1b1b1b", "#1f4e79", "#c55a11", "#8c8c8c", "#d9d9d9"


def save(fig, name):
    fig.savefig(OUT / name, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("ok", name)


def bars(ax, edges, counts, **kw):
    edges = np.asarray(edges, float)
    ax.bar(edges[:-1], counts, width=np.diff(edges), align="edge", **kw)


def logx(ax, lo, hi):
    ax.set_xscale("log")
    ax.set_xlim(lo, hi)
    ax.xaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{int(v):,}".replace(",", " ")))


# ---------------------------------------------------------------- Figura 1: McCC antes y después de limpiar
h = R["hist"]["McCC"]
e = h["edges"]
fig, ax = plt.subplots(figsize=(6.4, 3.4))
bars(ax, e, h["counts"]["antes"], facecolor="none", edgecolor=GREY, linewidth=1.1, label=f"Antes de limpiar (n = {R['meta']['n_bruto']:,})".replace(",", " "))
bars(ax, e, h["counts"]["despues"], facecolor=BLUE, alpha=0.75, edgecolor="white", linewidth=0.3, label=f"Después de limpiar (n = {R['meta']['n_final']:,})".replace(",", " "))
ax.axvline(10, color=ORANGE, linestyle="--", linewidth=1.3)
ax.text(10.6, ax.get_ylim()[1] * 0.93, "Umbral: McCC > 10", color=ORANGE, fontsize=10, va="top")
logx(ax, 1, e[-1])
ax.set_xlabel("Complejidad ciclomática (McCC), escala logarítmica")
ax.set_ylabel("Número de archivos")
ax.legend(frameon=False, fontsize=10, loc="upper right", bbox_to_anchor=(1.0, 0.82))
save(fig, "res_mcc_antes_despues.png")

# ---------------------------------------------------------------- Figura 2: McCC en cada grupo (proporción dentro de cada grupo)
gh = R["hist"]["grupos"]
ge = gh["edges"]
cb, cs = np.array(gh["counts"]["defectuosos"], float), np.array(gh["counts"]["sin_defecto"], float)
g = R["grupos"]
fig, ax = plt.subplots(figsize=(6.4, 3.4))
bars(ax, ge, cs / cs.sum(), facecolor=GREY, alpha=0.65, edgecolor="white", linewidth=0.3, label=f"Sin errores (n = {g['sin_defecto']['n']:,})".replace(",", " "))
bars(ax, ge, cb / cb.sum(), facecolor=ORANGE, alpha=0.6, edgecolor="white", linewidth=0.3, label=f"Con errores (n = {g['defectuosos']['n']:,})".replace(",", " "))
ax.axvline(g["sin_defecto"]["median"], color=INK, linestyle=":", linewidth=1.2)
ax.axvline(g["defectuosos"]["median"], color=ORANGE, linestyle=":", linewidth=1.2)
ax.text(g["sin_defecto"]["median"] * 0.93, ax.get_ylim()[1] * 0.97, f"Mediana {g['sin_defecto']['median']:.0f}", ha="right", va="top", fontsize=9.5)
ax.text(g["defectuosos"]["median"] * 1.07, ax.get_ylim()[1] * 0.97, f"Mediana {g['defectuosos']['median']:.0f}", ha="left", va="top", fontsize=9.5, color=ORANGE)
logx(ax, 1, ge[-1])
ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))
ax.set_xlabel("Complejidad ciclomática (McCC), escala logarítmica")
ax.set_ylabel("Proporción del grupo")
ax.legend(frameon=False, fontsize=10, loc="upper right", bbox_to_anchor=(1.0, 0.85))
save(fig, "res_mcc_grupos.png")

# ---------------------------------------------------------------- Figura 3: tamaño del efecto con intervalos de confianza
w, r, z = R["welch"], R["robusta"], R["z"]
rows = [
    ("Diferencia de medias de McCC\n(con errores − sin errores)", w["dif"], w["lo"], w["hi"], 0.0, "0"),
    ("Probabilidad de superioridad\nP(X > Y)", r["ps"], r["lo"], r["hi"], 0.5, "0.5"),
    ("Diferencia de proporciones\nP(error | alta) − P(error | no alta)", z["dif"], z["lo"], z["hi"], 0.0, "0"),
]
fig, axes = plt.subplots(3, 1, figsize=(6.2, 4.4))
for ax, (lab, est, lo, hi, ref, reflab) in zip(axes, rows):
    ax.axvline(ref, color=GREY, linewidth=1.2, linestyle="--")
    ax.hlines(0, lo, hi, color=BLUE, linewidth=4, alpha=0.5)
    ax.plot([est], [0], "o", color=BLUE, markersize=8, markerfacecolor="white", markeredgewidth=2)
    pad = (max(hi, ref) - min(lo, ref)) * 0.25
    ax.set_xlim(min(lo, ref) - pad, max(hi, ref) + pad)
    ax.set_ylim(-1, 1)
    ax.set_yticks([])
    ax.spines["left"].set_visible(False)
    ax.set_ylabel(lab, rotation=0, ha="right", va="center", fontsize=9.5, labelpad=10)
    fmt = (lambda v: f"{v:.1f}") if abs(est) > 5 else (lambda v: f"{v:.3f}")
    ax.text(est, 0.55, f"{fmt(est)}  [{fmt(lo)}, {fmt(hi)}]", ha="center", fontsize=9.5)
    ax.text(ref, -0.7, f"Sin efecto ({reflab})", ha="center", va="center", fontsize=8.5, color="#555555", bbox=dict(facecolor="white", edgecolor="none", pad=1.5))
fig.tight_layout()
save(fig, "res_efectos.png")

# ---------------------------------------------------------------- Figura 4: probabilidad de error en general y en archivos de complejidad alta
b = R["bayes"]
fig, ax = plt.subplots(figsize=(6.0, 2.0))
labs = ["P(D): cualquier archivo", "P(D | C): archivo de complejidad alta", "P(D | C̄): archivo de complejidad no alta"]
vals = [b["prior"], R["prob"]["p_d_given_c"], R["prob"]["p_d_given_nc"]]
cols = [GREY, ORANGE, BLUE]
ax.barh(range(3), vals, color=cols, alpha=0.85, height=0.55)
for i, v in enumerate(vals):
    ax.text(v + 0.01, i, f"{100 * v:.1f} %", va="center", fontsize=10)
ax.set_yticks(range(3), labs, fontsize=10)
ax.invert_yaxis()
ax.set_xlim(0, 0.55)
ax.xaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))
ax.set_xlabel("Probabilidad de tener al menos un error")
save(fig, "res_probabilidades.png")
