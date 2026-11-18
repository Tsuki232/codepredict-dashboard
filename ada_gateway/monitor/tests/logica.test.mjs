// Lógica pura del panel «Ada en vivo». Ejecutar:  node --test ada_gateway/monitor/tests
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cientifica, duracion, enVuelo, entero, frase, grupoDe, hace, haciendo, nombreRuta, num, percentil, porMinuto, resumen, tieneVias, usoDeCupos, viasCortas,
} from '../static/logica.js'

const ini = (id, t, extra = {}) => ({ e: 'inicio', id, t, ruta: '/v1/stats/bayes', cubo: 'stats', cliente: 'aaaaaa', origen: 'tunel', ...extra })
const fin = (id, t, extra = {}) => ({ e: 'fin', id, t, ruta: '/v1/stats/bayes', cubo: 'stats', cliente: 'aaaaaa', origen: 'tunel', estado: 200, ms: 100, d: {}, ...extra })

test('formato: cifras con notación científica solo cuando hace falta', () => {
  assert.equal(cientifica(1.57e-148), '1,57×10⁻¹⁴⁸')
  assert.equal(num(16.66667), '16,67')
  assert.equal(num(4.45571e-5), '4,46×10⁻⁵')
  assert.equal(num(0), '0')
  assert.equal(num(null), '—')
  assert.equal(entero(43744), '43.744')
  assert.equal(duracion(333), '333 ms')
  assert.equal(duracion(1500), '1,5 s')
  assert.equal(duracion(125000), '2 min 5 s')
  assert.equal(hace(2), 'ahora mismo')
  assert.equal(hace(90), 'hace 2 min')
})

test('cada petición terminada se cuenta con una frase hecha solo de su resumen', () => {
  assert.match(frase(fin('a', 1, { d: { tipo: 'chi_cuadrado', prueba: 'Chi-cuadrado de independencia', estadistico: 16.6667, df: 1, p: 4.45571e-5, verificado: true } })),
    /χ² = 16,67, gl 1, p = 4,46×10⁻⁵ · dos vías coinciden ✓/)
  assert.match(frase(fin('b', 1, { d: { tipo: 'pendulo', theta0: 90, T: 2.36784195, error_pct: 15.278692, verificado: true } })), /θ₀ = 90° → T = 2,3678 s.*15,28 %/)
  assert.match(frase(fin('c', 1, { d: { tipo: 'limpieza', filas_in: 43744, filas_out: 32509, verificado: true, pasos: [1, 2, 3, 4, 5, 6] } })), /43\.744 → 32\.509 filas · 6 pasos, todos verificados ✓/)
  assert.match(frase(fin('d', 1, { d: { tipo: 'inferencia', filas: 32509, verificado: true, pruebas: [1, 2, 3, 4, 5] } })), /5 pruebas sobre 32\.509 filas · todas verificadas ✓/)
  assert.match(frase(fin('e', 1, { d: { tipo: 'explicar', modo: 'explicar', tokens_entrada: 120, tokens_salida: 45, segundos: 3.2 } })), /120 → 45 tokens en 3,2 s/)
  assert.match(frase(fin('f', 1, { d: { tipo: 'bayes', estadistico: 0.416445, verificado: false } })), /¡las dos vías NO coinciden!/, 'una discrepancia nunca se esconde')
  assert.equal(frase(fin('g', 1, { estado: 401 })), 'Clave inválida')
  assert.equal(frase(fin('h', 1, { estado: 429 })), 'Demasiadas peticiones: se pidió que esperara')
  assert.equal(frase(fin('i', 1, { estado: 418 })), 'Error 418')
})

test('en vuelo: inicio sin fin; un arranque descarta lo anterior; lo muy viejo se da por perdido', () => {
  const ev = [ini('a', 100), ini('b', 101), fin('a', 102), ini('c', 103)]
  assert.deepEqual(enVuelo(ev, 105).map((e) => e.id), ['b', 'c'])
  assert.deepEqual(enVuelo([...ev, { e: 'arranque', t: 104, pid: 1 }, ini('d', 105)], 106).map((e) => e.id), ['d'], 'tras reiniciar la puerta de enlace nada anterior sigue en curso')
  assert.deepEqual(enVuelo([ini('viejo', 100)], 100 + 1300), [], 'sin cierre en 20 min se da por perdida')
})

test('peticiones por minuto: reparto por grupo, rechazadas aparte, y lo fuera de la ventana no cuenta', () => {
  const ahora = 6000 + 30
  const ev = [fin('a', 6005), fin('b', 6010, { cubo: 'pendulo' }), fin('c', 5950, { cubo: 'cp_limpio' }), fin('d', 6020, { estado: 429 }), fin('e', 6000 - 31 * 60)]
  const m = porMinuto(ev, ahora, 30)
  assert.equal(m.length, 30)
  assert.equal(m[29].total, 3)
  assert.deepEqual(m[29].grupos, { stats: 2, pendulo: 1 })
  assert.equal(m[29].rechazadas, 1)
  assert.equal(m[28].grupos.cp, 1, 'el conjunto limpio cuenta como CodePredict')
  assert.equal(m.reduce((s, b) => s + b.total, 0), 4, 'la de hace 31 minutos queda fuera')
})

test('cupos: solo cuenta las peticiones que empezaron en el último minuto', () => {
  const ev = [ini('a', 1000, { cubo: 'explicar' }), ini('b', 990, { cubo: 'explicar' }), ini('c', 900, { cubo: 'explicar' }), ini('d', 1000, { cubo: 'stats' })]
  assert.deepEqual(usoDeCupos(ev, 1005), { explicar: 2, stats: 1 })
})

test('resumen: verificadas, discrepancias, rechazos, origen y mediana', () => {
  const ev = [
    fin('a', 100, { ms: 10, d: { verificado: true } }), fin('b', 101, { ms: 30, d: { verificado: true } }), fin('c', 102, { ms: 20, d: { verificado: false } }),
    fin('d', 103, { estado: 401, ms: 1 }), fin('e', 104, { origen: 'local', cliente: 'bbbbbb', ms: 40, d: {} }),
  ]
  const r = resumen(ev, 110)
  assert.equal(r.total, 5); assert.equal(r.rechazadas, 1); assert.equal(r.verificadas, 2); assert.equal(r.noCoinciden, 1)
  assert.equal(r.porTunel, 4); assert.equal(r.locales, 1); assert.equal(r.clientes10min, 2); assert.equal(r.medianaMs, 30); assert.equal(r.ultima, 104)
  assert.equal(resumen([], 0).medianaMs, null)
})

test('las dos vías: se muestran solo si hay dos y la petición fue bien; los nombres se acortan', () => {
  assert.equal(tieneVias(fin('a', 1, { d: { vias: ['A', 'B'] } })), true)
  assert.equal(tieneVias(fin('a', 1, { d: { vias: ['A'] } })), false)
  assert.equal(tieneVias(fin('a', 1, { estado: 422, d: { vias: ['A', 'B'] } })), false)
  assert.deepEqual(viasCortas(['scipy.stats.chi2_contingency', 'formula manual Σ(O-E)²/E']), ['SciPy chi2_contingency', 'formula manual Σ(O-E)²/E'])
  assert.deepEqual(viasCortas(['pandas (mascaras booleanas)', 'DuckDB (COUNT(*) FILTER con parametros enlazados)']), ['pandas', 'DuckDB'])
})

test('grupos, nombres de ruta y verbos: lo desconocido no rompe', () => {
  assert.equal(grupoDe({ cubo: 'cp_limpio' }), 'cp'); assert.equal(grupoDe({ cubo: 'explicar' }), 'explicar'); assert.equal(grupoDe({ cubo: 'raro' }), 'otro')
  assert.equal(nombreRuta('/v1/stats/bayes'), 'Teorema de Bayes'); assert.equal(nombreRuta('/nueva'), '/nueva')
  assert.equal(haciendo('/v1/codepredict/limpieza'), 'Limpiando los datos'); assert.equal(haciendo('/nueva'), 'Atendiendo una petición')
  assert.equal(percentil([1, 2, 3, 4, 5], 50), 3); assert.equal(percentil([], 50), null)
})
