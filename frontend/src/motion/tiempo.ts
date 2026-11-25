/**
 * Tiempo y curvas como funciones puras (al estilo de las composiciones de vídeo): cada gráfica del tablero se dibuja como una función de `k`,
 * el progreso de su escena entre 0 y 1. Así la misma gráfica sirve para verla animarse, pausarla, saltar con la barra o retroceder.
 */

export const acota = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))

/** Progreso de una animación que ocurre solo entre `a` y `b` dentro de la escena (0 antes de `a`, 1 después de `b`). */
export const ventana = (k: number, a: number, b: number) => (b <= a ? (k >= b ? 1 : 0) : acota((k - a) / (b - a)))

/** Salida exponencial: arranca rápido y frena al llegar. Para entradas. */
export const expoOut = (x: number) => { const t = acota(x); return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t) }

/** Entrada y salida suaves (quíntica). Para desplazamientos. */
export const quintInOut = (x: number) => { const t = acota(x); return t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2 }

/** Salida cúbica: más amable que la exponencial para barras y áreas. */
export const cubicOut = (x: number) => 1 - Math.pow(1 - acota(x), 3)

export const mezcla = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Progreso del elemento `i` de `n` cuando todos entran escalonados dentro de la escena: cada uno arranca un poco después del anterior
 * y dura `dur` (fracción del tramo). `desde` y `hasta` recortan el tramo de la escena que ocupa el conjunto.
 */
export function escalon(k: number, i: number, n: number, dur = 0.45, desde = 0, hasta = 1): number {
  const ancho = hasta - desde
  const paso = n > 1 ? (ancho - dur * ancho) / (n - 1) : 0
  const ini = desde + i * paso
  return ventana(k, ini, ini + dur * ancho)
}

// ----------------------------------------------------------------------------- la película: escenas una detrás de otra

export interface Duracion { ms: number }

export const duracionTotal = (escenas: Duracion[]) => escenas.reduce((s, e) => s + e.ms, 0)

export const inicioDe = (i: number, escenas: Duracion[]) => escenas.slice(0, Math.max(0, i)).reduce((s, e) => s + e.ms, 0)

/** En qué escena cae el instante `t` (ms desde el principio) y qué fracción de ella ya pasó. Después del final se queda en la última, completa. */
export function posicion(t: number, escenas: Duracion[]): { i: number; k: number; inicio: number } {
  const total = duracionTotal(escenas)
  const x = acota(t, 0, total)
  let acumulado = 0
  for (let i = 0; i < escenas.length; i++) {
    const fin = acumulado + escenas[i].ms
    if (x < fin) return { i, k: (x - acumulado) / escenas[i].ms, inicio: acumulado }
    acumulado = fin
  }
  const ultima = Math.max(0, escenas.length - 1)
  return { i: ultima, k: 1, inicio: inicioDe(ultima, escenas) }
}

/** Texto que se va escribiendo: los primeros `k` del total de palabras (se corta en palabras enteras, no a mitad de una). */
export function palabras(texto: string, k: number): string {
  const p = texto.split(' ')
  return p.slice(0, Math.ceil(acota(k) * p.length)).join(' ')
}
