import { useEffect, useRef, useSyncExternalStore } from 'react'
import { acota, duracionTotal, inicioDe, posicion } from '../../motion/tiempo'
import type { Duracion } from '../../motion/tiempo'

/**
 * El modo película: las escenas del tablero una detrás de otra, como un vídeo (reproducir, pausar, saltar, velocidad, barra de tiempo).
 * El reloj vive fuera de React: cada escena se suscribe solo a su propio progreso, así que mientras una se anima las demás no se vuelven a dibujar.
 */

export interface EscenaDef extends Duracion { id: string; titulo: string; narracion: string }

export const VELOCIDADES = [0.5, 1, 1.5, 2] as const

export class Pelicula {
  escenas: EscenaDef[] = []
  reducir = false
  t = 0
  enMarcha = false
  activo = false          // false = modo libre: cada escena se anima sola al entrar en pantalla
  velocidad = 1
  /** Modo presentación: cada escena se reproduce y se detiene al final (completa) hasta que se pida la siguiente; nada avanza solo. */
  diapositivas = false
  private escenaFija = 0
  private version = 0
  private oyentes = new Set<() => void>()
  private raf = 0
  private ultimo = 0

  /** Guarda las escenas (silencioso: se puede llamar al renderizar). */
  configurar(escenas: EscenaDef[], reducir: boolean): void {
    this.escenas = escenas
    this.reducir = reducir
    this.t = acota(this.t, 0, this.total)
  }

  get total(): number { return duracionTotal(this.escenas) }
  get pos() { return posicion(this.t, this.escenas) }

  /** Progreso 0–1 de la escena `i` en la película; −1 si la película no está activa (la escena se anima sola). Las ya vistas y las próximas se ven completas. */
  kDe = (i: number): number => {
    if (!this.activo) return -1
    if (this.reducir) return 1
    const p = this.pos
    return p.i === i ? p.k : 1
  }

  escenaActiva = (): number => (this.activo ? this.pos.i : -1)

  suscribir = (f: () => void): (() => void) => { this.oyentes.add(f); return () => { this.oyentes.delete(f) } }
  instantanea = (): number => this.version

  private avisar(): void { this.version++; this.oyentes.forEach((f) => f()) }

  private arrancar(): void {
    cancelAnimationFrame(this.raf)
    this.ultimo = performance.now()
    const paso = (ahora: number) => {
      const dt = Math.min(100, ahora - this.ultimo) * this.velocidad      // al volver de otra pestaña no salta de golpe
      this.ultimo = ahora
      this.t += dt
      if (this.t >= this.total) { this.t = this.total; this.enMarcha = false; this.avisar(); return }
      if (this.diapositivas) {                                          // se queda al final de su escena, completa
        const fin = inicioDe(this.escenaFija, this.escenas) + this.escenas[this.escenaFija].ms
        if (this.t >= fin) { this.t = fin - 1e-6; this.enMarcha = false; this.avisar(); return }
      }
      this.avisar()
      this.raf = requestAnimationFrame(paso)
    }
    this.raf = requestAnimationFrame(paso)
  }

  reproducir = (): void => {
    if (!this.escenas.length) return
    if (this.t >= this.total) this.t = 0
    this.activo = true
    this.enMarcha = true
    this.escenaFija = this.pos.i
    this.arrancar()
    this.avisar()
  }

  /** Enciende o apaga el modo presentación (escena por escena, sin avanzar solo). */
  fijarDiapositivas = (v: boolean): void => { this.diapositivas = v; this.avisar() }

  pausar = (): void => { this.enMarcha = false; cancelAnimationFrame(this.raf); this.avisar() }
  alternar = (): void => { if (this.enMarcha) this.pausar(); else this.reproducir() }

  /** Vuelve al modo libre. */
  salir = (): void => { this.enMarcha = false; this.activo = false; cancelAnimationFrame(this.raf); this.avisar() }

  /** Salta al principio de la escena `i`. Con movimiento, sigue reproduciéndola; con «reducir movimiento», la muestra completa y espera. */
  ir = (i: number): void => {
    const n = this.escenas.length
    if (!n) return
    this.t = inicioDe(acota(Math.round(i), 0, n - 1), this.escenas)
    this.activo = true
    if (this.reducir) { this.enMarcha = false; cancelAnimationFrame(this.raf); this.avisar() } else this.reproducir()
  }

  siguiente = (): void => { const i = this.activo ? this.pos.i : -1; this.ir(i + 1) }
  anterior = (): void => { const i = this.activo ? this.pos.i : 1; this.ir(i - 1) }

  /** Mueve la barra de tiempo: salta a ese instante sin cambiar si estaba reproduciendo o en pausa. */
  buscar = (ms: number): void => { this.t = acota(ms, 0, this.total); this.activo = true; this.avisar() }

  fijarVelocidad = (v: number): void => { this.velocidad = v; this.avisar() }

  destruir = (): void => { cancelAnimationFrame(this.raf) }
}

/** Una película por pantalla; se reconfigura sola si cambian las escenas. */
export function usePelicula(escenas: EscenaDef[], reducir: boolean): Pelicula {
  const ref = useRef<Pelicula | null>(null)
  if (!ref.current) ref.current = new Pelicula()
  ref.current.configurar(escenas, reducir)
  useEffect(() => () => ref.current?.destruir(), [])
  return ref.current
}

/** Se vuelve a dibujar en cada cambio de la película (para la barra de controles). */
export function useVersion(p: Pelicula): number { return useSyncExternalStore(p.suscribir, p.instantanea) }

/** El progreso de una escena: solo se vuelve a dibujar cuando cambia el suyo. −1 = película apagada. */
export function useKEscena(p: Pelicula, i: number): number { return useSyncExternalStore(p.suscribir, () => p.kDe(i)) }

/** Índice de la escena que suena ahora (−1 si la película está apagada): cambia solo en cada corte de escena. */
export function useEscenaActiva(p: Pelicula): number { return useSyncExternalStore(p.suscribir, p.escenaActiva) }
