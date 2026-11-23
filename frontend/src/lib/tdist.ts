/**
 * La distribución t de Student escrita a mano, sin librerías, para dibujar las campanas y calcular áreas en el navegador.
 * Es una distribución CONTINUA: su gráfica es una curva (densidad) y las probabilidades son ÁREAS bajo ella; la probabilidad de un valor exacto es 0.
 * Se comprueba contra SciPy en `tdist.test.ts` (densidad, probabilidad acumulada y valores críticos).
 */

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]

/** ln Γ(x), por la aproximación de Lanczos (g = 7). */
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x)
  const z = x - 1
  let a = LANCZOS[0]
  const t = z + 7.5
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i)
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

export const normalPdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)

/** Densidad de la t con ν grados de libertad: Γ((ν+1)/2) / (√(νπ)·Γ(ν/2)) · (1 + x²/ν)^(−(ν+1)/2). */
export function tPdf(x: number, nu: number): number {
  const logc = lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI)
  return Math.exp(logc - ((nu + 1) / 2) * Math.log1p((x * x) / nu))
}

/** Fracción continua de la función beta incompleta (Numerical Recipes, «betacf»). */
function betacf(a: number, b: number, x: number): number {
  const TINY = 1e-300
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  d = Math.abs(d) < TINY ? 1 / TINY : 1 / d
  let h = d
  for (let m = 1; m <= 400; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + aa * d; d = Math.abs(d) < TINY ? 1 / TINY : 1 / d
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY
    h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + aa * d; d = Math.abs(d) < TINY ? 1 / TINY : 1 / d
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 3e-15) break
  }
  return h
}

/** Función beta incompleta regularizada I_x(a, b). */
function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b)
  const front = Math.exp(lbeta + a * Math.log(x) + b * Math.log1p(-x))
  return x < (a + 1) / (a + b + 2) ? (front * betacf(a, b, x)) / a : 1 - (front * betacf(b, a, 1 - x)) / b
}

/** P(T ≤ x): el área bajo la campana a la izquierda de x. */
export function tCdf(x: number, nu: number): number {
  if (x === 0) return 0.5
  const cola = 0.5 * ibeta(nu / (nu + x * x), nu / 2, 0.5)      // el área de la cola más lejana
  return x > 0 ? 1 - cola : cola
}

/** El valor de t que deja a su izquierda un área p (valor crítico). Por bisección sobre tCdf. */
export function tQuantile(p: number, nu: number): number {
  if (p <= 0 || p >= 1) return p <= 0 ? -Infinity : Infinity
  if (p === 0.5) return 0
  if (p < 0.5) return -tQuantile(1 - p, nu)
  let lo = 0
  let hi = 1
  while (tCdf(hi, nu) < p && hi < 1e8) hi *= 2
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (tCdf(mid, nu) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Puntos (x, f(x)) de una curva entre a y b: lo que se dibuja como campana. */
export function curva(f: (x: number) => number, a: number, b: number, n = 240): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = a + ((b - a) * i) / n
    return [x, f(x)] as [number, number]
  })
}
