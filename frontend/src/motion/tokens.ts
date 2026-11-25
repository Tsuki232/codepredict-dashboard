import type { Transition, Variants } from 'motion/react'

/**
 * Movimiento del dashboard: una sola fuente de curvas, resortes y tiempos (las guías de movimiento del proyecto):
 *  · nunca lineal: toda entrada usa una salida exponencial o un resorte;
 *  · una entrada mueve 2–3 propiedades a la vez (opacidad + desplazamiento + escala), nunca un fundido solo;
 *  · los elementos de un grupo entran escalonados, no a la vez;
 *  · las salidas son más rápidas que las entradas;
 *  · con «reducir movimiento» solo queda un fundido corto.
 */

type Curva = [number, number, number, number]

export const CURVA: Record<'salida' | 'movimiento' | 'entrada', Curva> = {
  salida: [0.16, 1, 0.3, 1],        // salida exponencial: entradas
  movimiento: [0.83, 0, 0.17, 1],   // quíntica de entrada y salida: desplazamientos
  entrada: [0.7, 0, 0.84, 1],       // solo para salidas
}

export const RESORTE = {
  nitido: { type: 'spring', damping: 14, stiffness: 160, mass: 0.6 },   // botones, etiquetas
  suave: { type: 'spring', damping: 20, stiffness: 90, mass: 1 },       // elementos grandes
  rebote: { type: 'spring', damping: 11, stiffness: 170, mass: 0.7 },   // acentos
} satisfies Record<string, Transition>

export const TIEMPO = { escalon: 0.055, entrada: 0.55, salida: 0.28, fundido: 0.18 } as const

/** El grupo: reparte las entradas de sus hijos una tras otra. */
export function contenedor(reducir: boolean): Variants {
  return { oculto: {}, visible: { transition: { staggerChildren: reducir ? 0 : TIEMPO.escalon, delayChildren: reducir ? 0 : 0.04 } } }
}

/** Cada hijo: sube desde abajo mientras se aclara y crece un poco. */
export function elemento(reducir: boolean): Variants {
  if (reducir) return { oculto: { opacity: 0 }, visible: { opacity: 1, transition: { duration: TIEMPO.fundido } } }
  return {
    oculto: { opacity: 0, y: 18, scale: 0.985 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: TIEMPO.entrada, ease: CURVA.salida } },
  }
}
