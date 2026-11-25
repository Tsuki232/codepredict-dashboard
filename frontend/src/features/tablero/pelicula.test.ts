import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pelicula } from './pelicula'
import type { EscenaDef } from './pelicula'
import { construirEscenas } from './escenas'

const ESC: EscenaDef[] = [
  { id: 'a', titulo: 'A', ms: 1000, narracion: 'uno' },
  { id: 'b', titulo: 'B', ms: 2000, narracion: 'dos' },
  { id: 'c', titulo: 'C', ms: 1000, narracion: 'tres' },
]

// Un reloj y un «cuadro» simulados: cada paso(ms) avanza el tiempo y ejecuta el cuadro pendiente.
let ahora = 0
let pendiente: ((t: number) => void) | null = null
const paso = (ms: number) => { ahora += ms; const f = pendiente; pendiente = null; f?.(ahora) }

beforeEach(() => {
  ahora = 1000
  pendiente = null
  vi.stubGlobal('performance', { now: () => ahora })
  vi.stubGlobal('requestAnimationFrame', (f: (t: number) => void) => { pendiente = f; return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => { pendiente = null })
})
afterEach(() => vi.unstubAllGlobals())

const nueva = (reducir = false) => { const p = new Pelicula(); p.configurar(ESC, reducir); return p }

describe('Pelicula', () => {
  it('apagada: no manda ninguna escena (cada una se anima sola)', () => {
    const p = nueva()
    expect([p.kDe(0), p.kDe(2), p.escenaActiva()]).toEqual([-1, -1, -1])
    expect(p.total).toBe(4000)
  })

  it('al reproducir avanza con el reloj y solo la escena que suena muestra su fracción', () => {
    const p = nueva()
    p.reproducir()
    expect(p.activo && p.enMarcha).toBe(true)
    for (let j = 0; j < 5; j++) paso(100)                           // cinco cuadros de 100 ms
    expect(p.t).toBe(500)
    expect([p.kDe(0), p.kDe(1), p.kDe(2), p.escenaActiva()]).toEqual([0.5, 1, 1, 0])        // las demás se ven completas
    for (let j = 0; j < 6; j++) paso(100)                           // 1 100 ms → ya en la escena B
    expect(p.escenaActiva()).toBe(1)
    expect(p.kDe(1)).toBeCloseTo(0.05, 12)
    expect(p.kDe(0)).toBe(1)
  })

  it('la velocidad multiplica el tiempo y un cuadro nunca avanza más de 100 ms (volver de otra pestaña no salta)', () => {
    const p = nueva()
    p.fijarVelocidad(2)
    p.reproducir()
    paso(50)
    expect(p.t).toBe(100)
    paso(5000)                                                      // la pestaña estuvo dormida
    expect(p.t).toBe(100 + 200)                                     // 100 ms máximos × velocidad 2
  })

  it('al llegar al final se detiene en la última escena completa y «reproducir» vuelve a empezar', () => {
    const p = nueva()
    p.buscar(3950)
    p.reproducir()
    paso(100)
    expect(p.enMarcha).toBe(false)
    expect(p.t).toBe(4000)
    expect([p.escenaActiva(), p.kDe(2)]).toEqual([2, 1])
    p.reproducir()
    expect([p.t, p.enMarcha]).toEqual([0, true])
  })

  it('pausar congela el tiempo y buscar mueve la barra sin cambiar si estaba en pausa', () => {
    const p = nueva()
    p.reproducir()
    paso(300)
    p.pausar()
    const t = p.t
    paso(1000)
    expect(p.t).toBe(t)
    p.buscar(1500)
    expect([p.t, p.enMarcha, p.escenaActiva()]).toEqual([1500, false, 1])
    p.buscar(-5)
    expect(p.t).toBe(0)
    p.buscar(10 ** 9)
    expect(p.t).toBe(4000)
  })

  it('siguiente y anterior saltan al principio de la escena y siguen reproduciendo', () => {
    const p = nueva()
    p.siguiente()                                                   // apagada: empieza por la primera
    expect([p.escenaActiva(), p.t, p.enMarcha]).toEqual([0, 0, true])
    p.siguiente()
    expect([p.escenaActiva(), p.t]).toEqual([1, 1000])
    p.siguiente(); p.siguiente()
    expect(p.escenaActiva()).toBe(2)                                // no pasa de la última
    p.anterior()
    expect(p.escenaActiva()).toBe(1)
    p.ir(0); p.anterior()
    expect(p.escenaActiva()).toBe(0)                                // ni de la primera
  })

  it('modo presentación: cada escena se reproduce, se detiene completa al final y no pasa sola a la siguiente', () => {
    const p = nueva()
    p.fijarDiapositivas(true)
    p.ir(0)
    for (let j = 0; j < 15; j++) paso(100)                          // 1 500 ms: la escena A dura 1 000
    expect([p.enMarcha, p.escenaActiva()]).toEqual([false, 0])      // se detuvo y sigue en A
    expect(p.kDe(0)).toBeCloseTo(1, 5)
    expect(p.t).toBeLessThan(1000)                                  // al final de A, antes de que empiece B
    p.siguiente()
    expect([p.escenaActiva(), p.t, p.enMarcha]).toEqual([1, 1000, true])
    for (let j = 0; j < 40; j++) paso(100)                          // B dura 2 000: se detiene al final de B, no sigue a C
    expect([p.enMarcha, p.escenaActiva()]).toEqual([false, 1])
    p.anterior()
    expect([p.escenaActiva(), p.t, p.enMarcha]).toEqual([0, 0, true])
  })

  it('en modo presentación, «reproducir» tras terminar la escena no avanza de escena', () => {
    const p = nueva()
    p.fijarDiapositivas(true)
    p.ir(1)
    for (let j = 0; j < 30; j++) paso(100)
    expect(p.enMarcha).toBe(false)
    p.reproducir()
    paso(100)
    expect([p.enMarcha, p.escenaActiva()]).toEqual([false, 1])
  })

  it('fuera del modo presentación la película sigue de largo (no se detiene entre escenas)', () => {
    const p = nueva()
    p.ir(0)
    for (let j = 0; j < 15; j++) paso(100)
    expect([p.enMarcha, p.escenaActiva()]).toEqual([true, 1])
  })

  it('salir vuelve al modo libre', () => {
    const p = nueva()
    p.reproducir()
    p.salir()
    expect([p.activo, p.enMarcha, p.kDe(0), p.escenaActiva()]).toEqual([false, false, -1, -1])
  })

  it('con «reducir movimiento» las escenas se ven completas y saltar no reproduce solo', () => {
    const p = nueva(true)
    p.ir(1)
    expect([p.activo, p.enMarcha, p.escenaActiva(), p.kDe(0), p.kDe(1), p.kDe(2)]).toEqual([true, false, 1, 1, 1, 1])
    expect(pendiente).toBeNull()
  })

  it('avisa a quien se suscribió, y deja de avisar al darse de baja', () => {
    const p = nueva()
    const f = vi.fn()
    const baja = p.suscribir(f)
    const v0 = p.instantanea()
    p.buscar(10)
    expect(f).toHaveBeenCalledTimes(1)
    expect(p.instantanea()).toBe(v0 + 1)
    baja()
    p.buscar(20)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('sin escenas no hace nada', () => {
    const p = new Pelicula()
    p.reproducir(); p.ir(3); p.siguiente()
    expect([p.activo, p.enMarcha, p.total]).toEqual([false, false, 0])
  })
})

describe('construirEscenas', () => {
  const vacio = { tab: null, w: null, perm: null, neu: null, ia: null, leng: 'java' as const }

  it('sin ningún dato solo queda el cierre', () => {
    expect(construirEscenas(vacio).map((e) => e.id)).toEqual(['cierre'])
  })

  it('cada escena trae título, duración positiva y un subtítulo, y los ids no se repiten', () => {
    const datos = {
      ...vacio,
      w: { t: 26.36, p: 0, rechaza: true } as never,
      perm: { repeticiones: 2000, extremos: 0, t_obs: 26.36 } as never,
      neu: { auc_prueba: 0.7, umbral: { exactitud: 0.78 }, regla_trivial: { exactitud: 0.77 } } as never,
    }
    const e = construirEscenas(datos)
    expect(e.map((x) => x.id)).toEqual(['welch', 'permutacion', 'neurona', 'cierre'])
    expect(new Set(e.map((x) => x.id)).size).toBe(e.length)
    for (const x of e) { expect(x.titulo).toBeTruthy(); expect(x.ms).toBeGreaterThan(0); expect(x.narracion).toBeTruthy() }
    expect(e[0].narracion).toContain('26,4')                          // las cifras salen de los datos, con coma decimal
    expect(e[1].narracion).toContain('ninguna t barajada')
    expect(e[2].narracion).toContain('78,0 %')
  })
})
