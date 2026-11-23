import { describe, expect, it } from 'vitest'
import { curva, lgamma, normalPdf, tCdf, tPdf, tQuantile } from './tdist'

/** Valores de referencia calculados con SciPy (scipy.stats.t y scipy.stats.norm). Cada fila: [grados de libertad, x o p, valor]. */
const PDF: [number, number, number][] = [
  [1, 0, 0.31830988618379075], [1, 1, 0.15915494309189535], [1, 3.5, 0.02402338763651251], [2, 0.5, 0.29629629629629634], [2, 2, 0.06804138174397716],
  [3, 1, 0.206748335783172], [5, 0, 0.3796066898224944], [5, 2, 0.06509031032621647], [5, 3.5, 0.00924435409252092], [10, 0, 0.38910838396603115],
  [10, 1, 0.23036198922913867], [30, 0, 0.39563218489409685], [30, 2, 0.05685227504719785], [30, 3.5, 0.001960455580802091],
  [10931, 0, 0.39893315640301336], [10931, 1, 0.2419596568447293], [10931, 3.5, 0.000875170401893471],
]
const CDF: [number, number, number][] = [
  [1, -3, 0.10241638234956672], [1, 0.7, 0.6944001122142147], [1, 6, 0.9474315432887466], [2, -1.5, 0.13619656244550055], [2, 2, 0.908248290463863],
  [3, 6, 0.9953636425538577], [5, -3, 0.015049623948731293], [5, 0.7, 0.7424255258425918], [5, 2, 0.9490302605850708], [10, -1.5, 0.08225366322272007],
  [10, 6, 0.9999339455698226], [30, -3, 0.0026949820328259727], [30, 2, 0.9726874775185085], [10931, -3, 0.0013529406425109912], [10931, 2, 0.9772375193847548],
]
const PPF: [number, number, number][] = [
  [1, 0.975, 12.706204736174694], [1, 0.995, 63.656741162871526], [2, 0.95, 2.9199855803537242], [2, 0.975, 4.302652729749462], [3, 0.975, 3.1824463052837078],
  [5, 0.975, 2.5705818356363146], [10, 0.975, 2.2281388519862744], [10, 0.995, 3.16927267261695], [30, 0.975, 2.0422724563012378], [10931, 0.975, 1.9601810305067682],
]

describe('la distribución t escrita a mano coincide con SciPy', () => {
  it('densidad: la altura de la campana', () => {
    for (const [nu, x, esperado] of PDF) expect(tPdf(x, nu), `pdf ν=${nu} x=${x}`).toBeCloseTo(esperado, 9)
  })

  it('probabilidad acumulada: el área a la izquierda', () => {
    for (const [nu, x, esperado] of CDF) expect(tCdf(x, nu), `cdf ν=${nu} x=${x}`).toBeCloseTo(esperado, 8)
  })

  it('valores críticos: dónde empieza la zona de rechazo', () => {
    for (const [nu, p, esperado] of PPF) expect(tQuantile(p, nu), `ppf ν=${nu} p=${p}`).toBeCloseTo(esperado, 6)
  })

  it('con muchos grados de libertad la t es casi la normal (por eso con 10 931 gl el valor crítico es 1,96)', () => {
    expect(normalPdf(0)).toBeCloseTo(0.3989422804014327, 12)
    expect(normalPdf(1.96)).toBeCloseTo(0.058440944333451476, 12)
    expect(Math.abs(tPdf(1, 10931) - normalPdf(1))).toBeLessThan(5e-5)
    expect(tQuantile(0.975, 10931)).toBeCloseTo(1.96, 3)
  })
})

describe('propiedades que explican la campana', () => {
  it('es simétrica y su acumulada en 0 es 0,5', () => {
    for (const nu of [1, 3, 10, 100]) {
      expect(tPdf(1.7, nu)).toBeCloseTo(tPdf(-1.7, nu), 12)
      expect(tCdf(0, nu)).toBe(0.5)
      expect(tCdf(1.7, nu) + tCdf(-1.7, nu)).toBeCloseTo(1, 12)
    }
  })

  it('el área total bajo la curva es 1 (por eso la probabilidad de un valor exacto es 0 y solo hay áreas)', () => {
    for (const nu of [2, 5, 30]) {
      const pts = curva((x) => tPdf(x, nu), -200, 200, 40000)
      const h = 400 / 40000
      const area = pts.reduce((s, [, y], i) => s + (i === 0 || i === pts.length - 1 ? y / 2 : y) * h, 0)
      expect(area, `ν=${nu}`).toBeCloseTo(1, 2)
    }
  })

  it('con pocos grados de libertad las colas pesan más (más probabilidad lejos del centro)', () => {
    expect(1 - tCdf(3, 2)).toBeGreaterThan(1 - tCdf(3, 10))
    expect(1 - tCdf(3, 10)).toBeGreaterThan(1 - tCdf(3, 10931))
    expect(tPdf(0, 2)).toBeLessThan(tPdf(0, 30))        // y el centro es más bajo
  })

  it('el valor crítico baja a medida que crece la muestra: 12,71 → 2,23 → 2,04 → 1,96', () => {
    const c = [1, 10, 30, 10931].map((nu) => tQuantile(0.975, nu))
    expect(c).toEqual([...c].sort((a, b) => b - a))
  })

  it('lgamma coincide con valores conocidos (Γ(5) = 24, Γ(1/2) = √π)', () => {
    expect(Math.exp(lgamma(5))).toBeCloseTo(24, 9)
    expect(Math.exp(lgamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 12)
  })

  it('curva() devuelve n+1 puntos entre a y b', () => {
    const c = curva((x) => x * x, -1, 1, 10)
    expect(c).toHaveLength(11)
    expect(c[0]).toEqual([-1, 1]); expect(c[10]).toEqual([1, 1]); expect(c[5][0]).toBeCloseTo(0, 12)
  })
})
