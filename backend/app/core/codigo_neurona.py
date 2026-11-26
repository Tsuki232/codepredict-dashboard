"""El código Python de la neurona, para leerlo y explicarlo en la pestaña «Código».

El texto de cada celda NO está copiado a mano: se toma con `inspect` de las funciones que de verdad se ejecutan (`tstudent`, `analisis_t`), así que lo que se
muestra es siempre lo que corre. Aquí solo se escribe el título y la explicación de cada pieza, en el orden en que se lee el algoritmo.
"""
from __future__ import annotations

import inspect
from typing import Any

from app.core import analisis_t, tstudent

# (id, título, explicación, función)
_CELDAS: list[tuple[str, str, str, Any]] = [
    ("datos", "1. De dónde salen los datos",
     "Se toman del conjunto limpio y guardado: la complejidad ciclomática (McCC) de cada archivo y si tiene bug (1) o no (0). Con eso se entrena la neurona.",
     analisis_t._neurona),
    ("sigmoide", "2. La función sigmoide",
     "Convierte cualquier número en una probabilidad entre 0 y 1: 1 / (1 + e^−z). Es lo que hace que la neurona responda «probabilidad de bug» y no un número cualquiera. "
     "El recorte (−35, 35) evita desbordes numéricos.",
     tstudent._sigmoide),
    ("neurona", "3. La neurona: partir, estandarizar y entrenar",
     "Una sola neurona: P(bug) = sigmoide(w·z + b), con z = log(1 + McCC) estandarizado. Pasos: (1) separa 80 % para entrenar y 20 % para probar, con la misma proporción de bugs en cada parte; "
     "(2) estandariza con la media y desviación del entrenamiento; (3) arranca prediciendo la tasa base de bugs; (4) repite 600 veces: calcula la probabilidad, mide el error (entropía cruzada), "
     "calcula el gradiente y mueve w y b un poco en contra de él (descenso de gradiente); (5) predice, compara con lo observado por tramos de complejidad y guarda los resultados.",
     tstudent.neurona),
    ("newton", "4. Segunda vía: Newton–Raphson",
     "La comprobación independiente: ajusta la misma neurona con otro método, que llega al óptimo en pocas iteraciones. Si w y b coinciden con los del descenso de gradiente "
     "(diferencia menor que 0,001), el entrenamiento está bien hecho.",
     tstudent._newton),
    ("metricas", "5. Matriz de confusión y métricas",
     "Con el 20 % que la neurona nunca vio: declara «con bug» si la probabilidad llega al umbral (0,5) y cuenta aciertos y errores: verdaderos y falsos positivos y negativos. "
     "De ahí salen exactitud, precisión, sensibilidad y F1.",
     tstudent._metricas),
    ("auc", "6. El área bajo la curva (AUC)",
     "Mide qué tan bien ordena la neurona: la probabilidad de que un archivo con bug reciba más puntaje que uno sin bug (0,5 = azar, 1 = perfecto). "
     "Se calcula con los rangos de los puntajes (estadístico U de Mann–Whitney).",
     tstudent._auc),
    ("roc", "7. La curva ROC",
     "Recorre los puntajes de mayor a menor y, en cada corte, anota qué fracción de los archivos con bug se detecta y qué fracción de los sanos se marca por error. "
     "El área por trapecios debe coincidir con el AUC anterior.",
     tstudent._curva_roc),
]


# Ejemplo SOLO PARA LEER: una red neuronal estándar (perceptrón multicapa). Es texto; nada la importa ni la ejecuta, y el tablero no la usa.
_EJEMPLO_MLP = '''import numpy as np

def sigmoide(z):
    return 1 / (1 + np.exp(-z))

def entrenar_red(z, y, ocultas=8, epocas=400, tasa=0.3, semilla=42):
    """Red 1 -> 8 (tanh) -> 1 (sigmoide). z: complejidad estandarizada, una columna; y: 1 si el archivo tiene bug."""
    rng = np.random.default_rng(semilla)
    W1, b1 = rng.normal(0, 0.5, (1, ocultas)), np.zeros(ocultas)   # capa oculta
    W2, b2 = rng.normal(0, 0.5, (ocultas, 1)), np.zeros(1)         # capa de salida
    n = len(y)
    for _ in range(epocas):
        # 1) hacia adelante: de la entrada a la probabilidad
        h = np.tanh(z @ W1 + b1)
        p = sigmoide(h @ W2 + b2)[:, 0]
        # 2) hacia atras: cuanto aporto cada peso al error
        d2 = ((p - y) / n)[:, None]
        d1 = (d2 @ W2.T) * (1 - h ** 2)                            # derivada de tanh = 1 - tanh^2
        # 3) descenso de gradiente: mover cada peso un poco en contra de su gradiente
        W2, b2 = W2 - tasa * (h.T @ d2), b2 - tasa * d2.sum(0)
        W1, b1 = W1 - tasa * (z.T @ d1), b1 - tasa * d1.sum(0)
    return W1, b1, W2, b2

def predecir(z, W1, b1, W2, b2):
    return sigmoide(np.tanh(z @ W1 + b1) @ W2 + b2)[:, 0]'''


def catalogo() -> list[dict[str, str]]:
    celdas = [{"id": i, "title": t, "about": a, "code": inspect.getsource(f).rstrip(), "ejemplo": False} for i, t, a, f in _CELDAS]
    celdas.append({
        "id": "ejemplo_mlp", "title": "8. Ejemplo: una red neuronal estándar (solo para leer)",
        "about": "Esto NO se ejecuta ni lo usa el tablero: es un ejemplo de cómo se vería una red de las de verdad para este mismo problema. Tiene una capa oculta de 8 neuronas "
                 "(tanh) y una de salida (sigmoide). Se entrena igual que la neurona única, pero el error se reparte hacia atrás por las dos capas (retropropagación). "
                 "La neurona de arriba es el caso particular sin capa oculta.",
        "code": _EJEMPLO_MLP, "ejemplo": True})
    return celdas
