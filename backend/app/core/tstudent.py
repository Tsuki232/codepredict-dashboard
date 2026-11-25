"""La t de Student, sencilla y con cada paso a la vista, para exponerla entre 5 personas.

Todo está hecho con fórmulas cortas de NumPy (cada una se puede escribir en el pizarrón) y SciPy solo aporta la tabla de la distribución t y la comprobación.
Aquí NO interviene ninguna IA: ni Ada ni un modelo de lenguaje. Tres piezas:

  · `welch`        la prueba t para comparar la complejidad media de los archivos con bug y sin bug (la t de Welch del informe: una t de Student que no
                   supone varianzas iguales), con el intervalo de confianza de cada media (t de Student) y la comprobación por dos vías.
  · `permutacion`  otra comprobación, sin fórmulas: baraja las etiquetas «con bug / sin bug» miles de veces y mira si una t tan grande podría salir por azar.
  · `neurona`      un algoritmo de predicción mínimo (una sola neurona, regresión logística) para estimar la probabilidad de bug según la complejidad.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy import stats

SEMILLA = 42


# ----------------------------------------------------------------------------- la t de Welch, paso a paso


def _resumen(a: np.ndarray, alpha: float) -> dict[str, float]:
    """Media, desviación estándar, error estándar (s/√n) e intervalo de confianza de la media con la t de Student (n−1 grados de libertad)."""
    n = a.size
    media, s = float(a.mean()), float(a.std(ddof=1))
    se = s / math.sqrt(n)
    crit = float(stats.t.ppf(1 - alpha / 2, n - 1))
    return {"n": int(n), "media": media, "sd": s, "se": se, "gl": int(n - 1), "t_critico": crit, "ic_bajo": media - crit * se, "ic_alto": media + crit * se,
            "mediana": float(np.median(a))}


def welch(x: np.ndarray, y: np.ndarray, alpha: float = 0.05, alternative: str = "two-sided") -> dict[str, Any]:
    """Compara las medias de x (con bug) y y (sin bug). Devuelve cada paso con su número, para poder explicarlo, y la comprobación contra SciPy."""
    if alternative not in ("two-sided", "greater", "less"):
        raise ValueError("alternative debe ser two-sided, greater o less")
    if not 0 < alpha < 1:
        raise ValueError("alpha debe estar entre 0 y 1")
    x, y = np.asarray(x, float), np.asarray(y, float)
    if x.size < 2 or y.size < 2:
        raise ValueError("Cada grupo necesita al menos 2 datos.")
    gx, gy = _resumen(x, alpha), _resumen(y, alpha)

    # Paso 1: la diferencia de medias.  Paso 2: su error estándar.  Paso 3: t = diferencia / error.  Paso 4: grados de libertad de Welch–Satterthwaite.
    dif = gx["media"] - gy["media"]
    a, b = gx["sd"] ** 2 / gx["n"], gy["sd"] ** 2 / gy["n"]          # s₁²/n₁ y s₂²/n₂
    se = math.sqrt(a + b)
    t = dif / se
    gl = (a + b) ** 2 / (a ** 2 / (gx["n"] - 1) + b ** 2 / (gy["n"] - 1))
    # Paso 5: valor p (el área de la cola) y valores críticos (dónde empieza la zona de rechazo).
    if alternative == "two-sided":
        p = 2 * float(stats.t.sf(abs(t), gl))
        c = float(stats.t.ppf(1 - alpha / 2, gl))
        critico = {"bajo": -c, "alto": c}
    elif alternative == "greater":
        p = float(stats.t.sf(t, gl))
        critico = {"bajo": None, "alto": float(stats.t.ppf(1 - alpha, gl))}
    else:
        p = float(stats.t.cdf(t, gl))
        critico = {"bajo": float(stats.t.ppf(alpha, gl)), "alto": None}
    rechaza = p < alpha
    # Intervalo de confianza de la diferencia (siempre de dos colas, nivel 1−α).
    c2 = float(stats.t.ppf(1 - alpha / 2, gl))
    ic = {"bajo": dif - c2 * se, "alto": dif + c2 * se, "nivel": 1 - alpha}
    # Tamaño del efecto: g de Hedges (cuántas desviaciones estándar separan las medias).
    sp = math.sqrt((gx["sd"] ** 2 + gy["sd"] ** 2) / 2)
    g = dif / sp * (1 - 3 / (4 * (gx["n"] + gy["n"]) - 9))

    # Comprobación por dos vías: la fórmula a mano contra SciPy.
    sci = stats.ttest_ind(x, y, equal_var=False, alternative=alternative)
    sci_gl = float(getattr(sci, "df", gl))
    ok = (math.isclose(t, float(sci.statistic), rel_tol=1e-9) and math.isclose(p, float(sci.pvalue), rel_tol=1e-9, abs_tol=1e-300)
          and math.isclose(gl, sci_gl, rel_tol=1e-9))
    return {
        "alpha": alpha, "alternativa": alternative, "grupos": {"con_bug": gx, "sin_bug": gy},
        "pasos": {"diferencia": dif, "termino_1": a, "termino_2": b, "error_estandar": se, "t": t, "gl": gl},
        "t": t, "gl": gl, "p": p, "critico": critico, "rechaza": bool(rechaza), "ic_diferencia": ic,
        "efecto": {"nombre": "g de Hedges", "valor": g},
        "verificacion": {"scipy_t": float(sci.statistic), "scipy_p": float(sci.pvalue), "scipy_gl": sci_gl, "coincide": bool(ok),
                         "diferencia_t": abs(t - float(sci.statistic))},
        "student_clasica": _student_clasica(x, y),
    }


def _student_clasica(x: np.ndarray, y: np.ndarray) -> dict[str, float]:
    """La t de Student del libro (varianza agrupada), solo para comparar: aquí las varianzas no son iguales, por eso el informe usa Welch."""
    n1, n2 = x.size, y.size
    sp2 = ((n1 - 1) * x.var(ddof=1) + (n2 - 1) * y.var(ddof=1)) / (n1 + n2 - 2)
    t = (x.mean() - y.mean()) / math.sqrt(sp2 * (1 / n1 + 1 / n2))
    return {"t": float(t), "gl": float(n1 + n2 - 2), "razon_varianzas": float(x.var(ddof=1) / y.var(ddof=1))}


# ----------------------------------------------------------------------------- comprobación sin fórmulas: permutación


def _t_welch_rapida(s1: np.ndarray, q1: np.ndarray, n1: int, n2: int, total: float, total2: float) -> np.ndarray:
    """La t de Welch de muchas particiones a la vez, a partir de sumas (s1 = suma del grupo 1, q1 = suma de cuadrados del grupo 1)."""
    m1 = s1 / n1
    m2 = (total - s1) / n2
    v1 = (q1 - n1 * m1 ** 2) / (n1 - 1)
    v2 = ((total2 - q1) - n2 * m2 ** 2) / (n2 - 1)
    return (m1 - m2) / np.sqrt(v1 / n1 + v2 / n2)


def permutacion(x: np.ndarray, y: np.ndarray, repeticiones: int = 2000, semilla: int = SEMILLA) -> dict[str, Any]:
    """Baraja las etiquetas «con bug / sin bug» `repeticiones` veces y calcula la t de cada barajada. Si en verdad no hubiera diferencia, las etiquetas serían
    intercambiables: la t observada tendría que parecerse a las barajadas. La fracción de barajadas con una t tan grande como la real es el valor p de permutación."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    n1, n2 = x.size, y.size
    todo = np.concatenate([x, y])
    total, total2 = float(todo.sum()), float((todo ** 2).sum())
    t_obs = float(_t_welch_rapida(np.array([x.sum()]), np.array([(x ** 2).sum()]), n1, n2, total, total2)[0])
    rng = np.random.default_rng(semilla)
    s1, q1 = np.empty(repeticiones), np.empty(repeticiones)
    for i in range(repeticiones):
        sel = todo[rng.permutation(todo.size)[:n1]]            # los n₁ archivos que «se quedan con la etiqueta de con bug»
        s1[i], q1[i] = sel.sum(), (sel ** 2).sum()
    t_perm = _t_welch_rapida(s1, q1, n1, n2, total, total2)
    extremos = int(np.sum(np.abs(t_perm) >= abs(t_obs)))
    p = (extremos + 1) / (repeticiones + 1)                     # el +1 cuenta la partición real: nunca da 0
    return {"repeticiones": repeticiones, "semilla": semilla, "t_obs": t_obs, "t_perm": [round(float(v), 4) for v in t_perm],
            "extremos": extremos, "p": p, "p_minimo": 1 / (repeticiones + 1), "media_perm": float(t_perm.mean()), "sd_perm": float(t_perm.std(ddof=1)),
            "max_abs_perm": float(np.abs(t_perm).max())}


# ----------------------------------------------------------------------------- predicción: una sola neurona


def _sigmoide(z: np.ndarray) -> np.ndarray:
    return 1 / (1 + np.exp(-np.clip(z, -35, 35)))


def _auc(puntaje: np.ndarray, etiqueta: np.ndarray) -> float:
    """Área bajo la curva ROC = probabilidad de que un archivo con bug reciba más puntaje que uno sin bug (estadístico U de Mann–Whitney)."""
    r = stats.rankdata(puntaje)
    n1 = int(etiqueta.sum())
    n0 = etiqueta.size - n1
    return float((r[etiqueta == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def _curva_roc(puntaje: np.ndarray, etiqueta: np.ndarray, max_puntos: int = 80) -> dict[str, Any]:
    """Curva ROC: recorre los puntajes de mayor a menor y, en cada corte, anota la fracción de archivos con bug detectados (sensibilidad) y la de archivos sin bug
    marcados por error (1 − especificidad). Los empates se cortan juntos. El área se calcula por trapecios con la curva completa y se guardan solo `max_puntos` para dibujarla."""
    orden = np.argsort(-puntaje, kind="stable")
    p, e = puntaje[orden], etiqueta[orden]
    vp, fp = np.cumsum(e), np.cumsum(1 - e)
    fin_de_grupo = np.r_[p[1:] != p[:-1], True]
    tpr = np.r_[0.0, vp[fin_de_grupo] / vp[-1]]
    fpr = np.r_[0.0, fp[fin_de_grupo] / fp[-1]]
    area = float(np.sum(np.diff(fpr) * (tpr[1:] + tpr[:-1]) / 2))
    if fpr.size > max_puntos:
        idx = np.unique(np.linspace(0, fpr.size - 1, max_puntos).round().astype(int))
        fpr, tpr = fpr[idx], tpr[idx]
    return {"puntos": [{"fpr": float(a), "tpr": float(b)} for a, b in zip(fpr, tpr)], "auc_trapecios": area}


def _metricas(prob: np.ndarray, y: np.ndarray, umbral: float = 0.5) -> dict[str, Any]:
    """Matriz de confusión y métricas al declarar «con bug» cuando la probabilidad llega al umbral."""
    pred = prob >= umbral
    vp, fp = int(np.sum(pred & (y == 1))), int(np.sum(pred & (y == 0)))
    fn, vn = int(np.sum(~pred & (y == 1))), int(np.sum(~pred & (y == 0)))
    prec = vp / (vp + fp) if vp + fp else None
    sens = vp / (vp + fn) if vp + fn else None
    f1 = 2 * prec * sens / (prec + sens) if prec is not None and sens is not None and prec + sens > 0 else None
    return {"umbral": umbral, "vp": vp, "fp": fp, "fn": fn, "vn": vn, "exactitud": (vp + vn) / y.size, "precision": prec, "sensibilidad": sens, "f1": f1}


def _newton(z: np.ndarray, y: np.ndarray, pasos: int = 25) -> tuple[float, float]:
    """Segunda vía: ajusta la misma neurona con el método de Newton–Raphson (mínimos cuadrados reponderados), que llega al óptimo en pocas iteraciones."""
    X = np.column_stack([z, np.ones_like(z)])
    beta = np.zeros(2)
    for _ in range(pasos):
        p = _sigmoide(X @ beta)
        W = p * (1 - p)
        H = X.T @ (X * W[:, None])
        beta = beta + np.linalg.solve(H + 1e-12 * np.eye(2), X.T @ (y - p))
    return float(beta[0]), float(beta[1])


def neurona(mccc: np.ndarray, defecto: np.ndarray, semilla: int = SEMILLA, epocas: int = 600, tasa: float = 0.5) -> dict[str, Any]:
    """Una neurona: P(bug) = sigmoide(w·z + b), con z = complejidad estandarizada (log(1+McCC)). Se entrena con descenso de gradiente (80 % de los archivos) y se
    evalúa con el 20 % que nunca vio. Se comprueba por una segunda vía (Newton–Raphson) y, en las pruebas, contra scikit-learn."""
    mccc, y = np.asarray(mccc, float), np.asarray(defecto, float)
    u = np.log1p(mccc)
    rng = np.random.default_rng(semilla)
    prueba = np.zeros(u.size, bool)
    for clase in (0, 1):                                            # 20 % de cada clase para probar (partición estratificada)
        idx = np.flatnonzero(y == clase)
        prueba[rng.choice(idx, size=int(round(0.2 * idx.size)), replace=False)] = True
    ent, tst = ~prueba, prueba
    mu, sd = float(u[ent].mean()), float(u[ent].std())
    z = (u - mu) / sd

    w, b = 0.0, float(np.log(y[ent].mean() / (1 - y[ent].mean())))   # arranca prediciendo la tasa base de bugs
    historia = []
    for e in range(epocas + 1):
        p = _sigmoide(w * z[ent] + b)
        if e % 10 == 0 or e < 10:
            perdida = float(-np.mean(y[ent] * np.log(p + 1e-12) + (1 - y[ent]) * np.log(1 - p + 1e-12)))
            historia.append({"epoca": e, "w": float(w), "b": float(b), "perdida": perdida})
        gw, gb = float(np.mean((p - y[ent]) * z[ent])), float(np.mean(p - y[ent]))      # el gradiente de la entropía cruzada
        w, b = w - tasa * gw, b - tasa * gb
    w_n, b_n = _newton(z[ent], y[ent])

    prob = _sigmoide(w * z + b)
    base = float(y.mean())

    def p_de(m: float) -> float:
        return float(_sigmoide(w * (math.log1p(m) - mu) / sd + b))

    # Comparación de lo predicho con lo observado, por tramos de complejidad.
    cortes = np.unique(np.quantile(mccc, [0, .2, .4, .6, .8, .9, .97, 1.0]))
    tramos = []
    for lo, hi in zip(cortes[:-1], cortes[1:]):
        m = (mccc >= lo) & ((mccc < hi) if hi < cortes[-1] else (mccc <= hi))
        if m.sum():
            tramos.append({"desde": float(lo), "hasta": float(hi), "n": int(m.sum()), "observado": float(y[m].mean()), "predicho": float(prob[m].mean())})
    return {
        "semilla": semilla, "epocas": epocas, "tasa_aprendizaje": tasa, "n_entrenamiento": int(ent.sum()), "n_prueba": int(tst.sum()), "tasa_base": base,
        "w": float(w), "b": float(b), "media_log": mu, "sd_log": sd,
        "formula": {"pendiente_log": float(w / sd), "intercepto": float(b - w * mu / sd)},     # logit(P) = intercepto + pendiente·log(1+McCC)
        "historia": historia, "auc_prueba": _auc(prob[tst], y[tst]), "auc_entrenamiento": _auc(prob[ent], y[ent]),
        "roc": _curva_roc(prob[tst], y[tst]), "umbral": _metricas(prob[tst], y[tst]),
        "regla_trivial": {"exactitud": float(max(y[tst].mean(), 1 - y[tst].mean()))},       # acertar siempre con la clase más común: la vara que debe superar el modelo
        "ejemplos": [{"mccc": m, "p": p_de(m)} for m in (1, 2, 5, 10, 20, 50, 100, 200)], "tramos": tramos,
        "verificacion": {"w_newton": w_n, "b_newton": b_n, "diferencia_w": abs(w - w_n), "diferencia_b": abs(b - b_n), "coincide": bool(abs(w - w_n) < 1e-3 and abs(b - b_n) < 1e-3)},
    }
