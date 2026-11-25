import { describe, expect, it } from 'vitest'
import { acota, cubicOut, duracionTotal, escalon, expoOut, inicioDe, mezcla, palabras, posicion, quintInOut, ventana } from './tiempo'

describe('curvas y ventanas', () => {
  it('acota deja el valor dentro del rango', () => {
    expect([acota(-1), acota(0.4), acota(7)]).toEqual([0, 0.4, 1])
    expect(acota(5, 2, 3)).toBe(3)
  })

  it('ventana es 0 antes, 1 después y lineal entre a y b', () => {
    expect([ventana(0.1, 0.25, 0.75), ventana(0.25, 0.25, 0.75), ventana(0.5, 0.25, 0.75), ventana(0.75, 0.25, 0.75), ventana(0.9, 0.25, 0.75)]).toEqual([0, 0, 0.5, 1, 1])
    expect(ventana(0.3, 0.5, 0.5)).toBe(0)       // ventana de ancho cero: salta de golpe
    expect(ventana(0.5, 0.5, 0.5)).toBe(1)
  })

  it('las curvas empiezan en 0, terminan en 1 y nunca retroceden', () => {
    for (const f of [expoOut, quintInOut, cubicOut]) {
      expect(f(0)).toBeCloseTo(0, 12)
      expect(f(1)).toBe(1)
      let antes = -1
      for (let x = 0; x <= 1.0001; x += 0.05) { const y = f(x); expect(y).toBeGreaterThanOrEqual(antes); antes = y }
    }
  })

  it('valores conocidos a mano', () => {
    expect(expoOut(0.5)).toBeCloseTo(1 - 2 ** -5, 12)       // 0,96875
    expect(quintInOut(0.5)).toBeCloseTo(0.5, 12)
    expect(quintInOut(0.25) + quintInOut(0.75)).toBeCloseTo(1, 12)    // simétrica
    expect(cubicOut(0.5)).toBeCloseTo(0.875, 12)
    expect(mezcla(10, 20, 0.25)).toBe(12.5)
  })

  it('la salida exponencial avanza más rápido al principio que la quíntica', () => {
    expect(expoOut(0.2)).toBeGreaterThan(quintInOut(0.2))
  })
})

describe('escalon: entradas una tras otra', () => {
  it('el primero arranca en 0 y el último termina justo al final del tramo', () => {
    expect(escalon(0, 0, 3)).toBe(0)
    expect(escalon(1, 2, 3)).toBe(1)
    expect(escalon(0.25, 0, 3, 0.5)).toBeCloseTo(0.5, 12)    // ventana del primero: 0 → 0,5
  })

  it('cada elemento empieza después del anterior', () => {
    const k = 0.4
    const p = [0, 1, 2, 3].map((i) => escalon(k, i, 4, 0.4))
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeLessThanOrEqual(p[i - 1])
    expect(p[3]).toBe(0)
  })

  it('con un solo elemento no hay desfase y respeta desde y hasta', () => {
    expect(escalon(0.5, 0, 1, 1, 0, 1)).toBe(0.5)
    expect(escalon(0.25, 0, 1, 1, 0.5, 1)).toBe(0)
  })
})

describe('la película: en qué escena cae cada instante', () => {
  const esc = [{ ms: 1000 }, { ms: 2000 }, { ms: 500 }]

  it('suma duraciones e inicios', () => {
    expect(duracionTotal(esc)).toBe(3500)
    expect([inicioDe(0, esc), inicioDe(1, esc), inicioDe(2, esc), inicioDe(-3, esc)]).toEqual([0, 1000, 3000, 0])
  })

  it('posicion devuelve escena, fracción e inicio', () => {
    expect(posicion(500, esc)).toEqual({ i: 0, k: 0.5, inicio: 0 })
    expect(posicion(1000, esc)).toEqual({ i: 1, k: 0, inicio: 1000 })
    expect(posicion(2000, esc)).toEqual({ i: 1, k: 0.5, inicio: 1000 })
    expect(posicion(3250, esc)).toEqual({ i: 2, k: 0.5, inicio: 3000 })
  })

  it('antes del principio se queda en 0 y después del final, en la última escena completa', () => {
    expect(posicion(-50, esc)).toEqual({ i: 0, k: 0, inicio: 0 })
    expect(posicion(99999, esc)).toEqual({ i: 2, k: 1, inicio: 3000 })
    expect(posicion(0, [])).toEqual({ i: 0, k: 1, inicio: 0 })
  })
})

describe('palabras: el subtítulo que se escribe', () => {
  it('muestra palabras enteras según el progreso', () => {
    const t = 'uno dos tres cuatro'
    expect([palabras(t, 0), palabras(t, 0.25), palabras(t, 0.5), palabras(t, 0.51), palabras(t, 1), palabras(t, 3)]).toEqual(['', 'uno', 'uno dos', 'uno dos tres', t, t])
  })
})
