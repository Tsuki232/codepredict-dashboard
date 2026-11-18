// Lógica PURA del panel «Ada en vivo» (sin DOM): qué petición está en curso, cómo se describe cada una y cómo se agrupan. Se prueba con `node --test`.

/** Grupos de peticiones y su color (series validadas del método de visualización; «otras» va en gris). */
export const GRUPOS = {
  stats: { nombre: 'Estadística', color: 'var(--serie-1)' },
  pendulo: { nombre: 'Péndulo', color: 'var(--serie-2)' },
  cp: { nombre: 'CodePredict', color: 'var(--serie-3)' },
  explicar: { nombre: 'Asistente de texto', color: 'var(--serie-4)' },
  otro: { nombre: 'Otras', color: 'var(--apagado)' },
}

export const grupoDe = (ev) => (ev.cubo === 'cp_limpio' ? 'cp' : GRUPOS[ev.cubo] ? ev.cubo : 'otro')

const RUTAS = {
  '/v1/stats/dos_grupos': 'Comparación de dos grupos',
  '/v1/stats/chi_cuadrado': 'χ² de independencia',
  '/v1/stats/dos_proporciones': 'Dos proporciones',
  '/v1/stats/bayes': 'Teorema de Bayes',
  '/ada/pendulum/verify': 'Péndulo: período exacto',
  '/v1/codepredict/perfil': 'Perfil del CSV',
  '/v1/codepredict/limpieza': 'Vista previa de la limpieza',
  '/v1/codepredict/inferencia': 'Limpieza e inferencia completas',
  '/v1/codepredict/limpio': 'Conjunto limpio verificado',
  '/v1/explicar': 'Explicación con el modelo de lenguaje',
  '(otra)': 'Ruta desconocida',
}

export const nombreRuta = (ruta) => RUTAS[ruta] ?? ruta

/** Qué hace Ada, en gerundio, mientras la petición está en curso. */
const HACIENDO = {
  '/v1/stats/dos_grupos': 'Comparando dos grupos',
  '/v1/stats/chi_cuadrado': 'Calculando χ²',
  '/v1/stats/dos_proporciones': 'Comparando dos proporciones',
  '/v1/stats/bayes': 'Aplicando el teorema de Bayes',
  '/ada/pendulum/verify': 'Resolviendo el período del péndulo',
  '/v1/codepredict/perfil': 'Leyendo el CSV',
  '/v1/codepredict/limpieza': 'Limpiando los datos',
  '/v1/codepredict/inferencia': 'Limpiando y calculando las 5 pruebas',
  '/v1/codepredict/limpio': 'Preparando el conjunto limpio',
  '/v1/explicar': 'Escribiendo una explicación',
}

export const haciendo = (ruta) => HACIENDO[ruta] ?? 'Atendiendo una petición'

const MOTIVOS = { 401: 'Clave inválida', 413: 'Petición demasiado grande', 422: 'Datos inválidos', 429: 'Demasiadas peticiones: se pidió que esperara', 503: 'Ada ocupada o cargándose', 502: 'El modelo de lenguaje no respondió' }

// ----------------------------------------------------------------------------- formato

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }

export function cientifica(x, cifras = 3) {
  const [m, e] = x.toExponential(cifras - 1).split('e')
  return `${Number(m).toLocaleString('es-CO')}×10${[...String(parseInt(e, 10))].map((c) => SUP[c]).join('')}`
}

export function num(x, cifras = 4) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—'
  if (x === 0) return '0'
  const a = Math.abs(x)
  if (a >= 1e5 || a < 1e-3) return cientifica(x, 3)
  return Number(x.toPrecision(cifras)).toLocaleString('es-CO', { maximumFractionDigits: 6 })
}

export const entero = (x) => (x === null || x === undefined ? '—' : Math.round(x).toLocaleString('es-CO'))

export function duracion(ms) {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60000) return `${(ms / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} s`
  return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`
}

export function hace(segundos) {
  if (segundos < 5) return 'ahora mismo'
  if (segundos < 60) return `hace ${Math.round(segundos)} s`
  if (segundos < 3600) return `hace ${Math.round(segundos / 60)} min`
  return `hace ${Math.round(segundos / 3600)} h`
}

export const hora = (t) => new Date(t * 1000).toLocaleTimeString('es-CO', { hour12: false })
export const persona = (c) => (c && c !== '------' ? `compañero ${c}` : 'alguien')

// ----------------------------------------------------------------------------- qué se describe de cada petición terminada

/** Frase en español de lo que hizo Ada, usando solo lo que quedó registrado (resumen, nunca datos). */
export function frase(ev) {
  if (ev.estado >= 400) return MOTIVOS[ev.estado] ?? `Error ${ev.estado}`
  const d = ev.d ?? {}
  const vias = d.verificado === true ? ' · dos vías coinciden ✓' : d.verificado === false ? ' · ¡las dos vías NO coinciden!' : ''
  switch (d.tipo) {
    case 'dos_grupos':
      return `${d.prueba ?? 'Comparación'}: t = ${num(d.estadistico)}, gl ${num(d.df, 5)}, p = ${num(d.p, 3)}${vias}`
    case 'chi_cuadrado':
      return `${d.prueba ?? 'χ²'}: χ² = ${num(d.estadistico)}, gl ${num(d.df, 3)}, p = ${num(d.p, 3)}${vias}`
    case 'dos_proporciones':
      return `Dos proporciones: z = ${num(d.estadistico)}, p = ${num(d.p, 3)}${vias}`
    case 'bayes':
      return `P(D|C) = ${num(d.estadistico)} con Bayes${vias}`
    case 'pendulo':
      return `θ₀ = ${num(d.theta0, 4)}° → T = ${num(d.T, 5)} s (el período real es ${num(d.error_pct, 4)} % mayor que el lineal)${vias}`
    case 'perfil':
      return `Perfil de ${entero(d.filas)} filas`
    case 'limpieza':
      return `${entero(d.filas_in)} → ${entero(d.filas_out)} filas · ${(d.pasos ?? []).length} pasos${d.verificado ? ', todos verificados ✓' : d.verificado === false ? ', ¡algún paso NO coincide!' : ''}`
    case 'inferencia': {
      const n = (d.pruebas ?? []).length
      return `${n} pruebas sobre ${entero(d.filas)} filas${d.verificado ? ' · todas verificadas ✓' : ' · ¡alguna NO coincide!'}`
    }
    case 'limpio':
      return `Conjunto limpio de ${entero(d.filas)} filas (${(d.bytes_csv / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB) entregado`
    case 'explicar':
      return `${d.modo === 'repaso' ? 'Preguntas de repaso' : 'Explicación'}: ${entero(d.tokens_entrada)} → ${entero(d.tokens_salida)} tokens en ${num(d.segundos, 3)} s`
    default:
      return 'Atendida'
  }
}

/** ¿Hay dos vías que mostrar? (las que Ada usó para verificar) */
export const tieneVias = (ev) => ev.estado < 400 && Array.isArray(ev.d?.vias) && ev.d.vias.length >= 2

/** Nombre corto de cada vía para rotular el dibujo: el primer método y el segundo (los que Ada declaró). */
export function viasCortas(vias) {
  const corto = (s) => String(s).replace(/\s\(.*$/, '').replace(/^scipy\.stats\./, 'SciPy ').replace(/^statsmodels\.?/, 'statsmodels ').trim().slice(0, 34)
  return [corto(vias[0]), corto(vias[1])]
}

// ----------------------------------------------------------------------------- estado a partir de los eventos

/** Peticiones en curso: tienen «inicio» y todavía no «fin». Un arranque de la puerta de enlace descarta las anteriores; una sin cierre en 20 min se da por perdida. */
export function enVuelo(eventos, ahora) {
  const abiertas = new Map()
  for (const ev of eventos) {
    if (ev.e === 'arranque') abiertas.clear()
    else if (ev.e === 'inicio') abiertas.set(ev.id, ev)
    else if (ev.e === 'fin') abiertas.delete(ev.id)
  }
  return [...abiertas.values()].filter((ev) => ahora - ev.t < 1200).sort((a, b) => a.t - b.t)
}

export const terminadas = (eventos) => eventos.filter((ev) => ev.e === 'fin')

/** Peticiones por minuto de los últimos `minutos`, repartidas por grupo (la más antigua primero). */
export function porMinuto(eventos, ahora, minutos = 30) {
  const base = Math.floor(ahora / 60) * 60
  const cubos = Array.from({ length: minutos }, (_, i) => ({ t0: base - (minutos - 1 - i) * 60, total: 0, rechazadas: 0, grupos: {} }))
  for (const ev of terminadas(eventos)) {
    const i = minutos - 1 - Math.floor((base - Math.floor(ev.t / 60) * 60) / 60)
    if (i < 0 || i >= minutos) continue
    cubos[i].total += 1
    if (ev.estado >= 400) cubos[i].rechazadas += 1
    const g = grupoDe(ev)
    cubos[i].grupos[g] = (cubos[i].grupos[g] ?? 0) + 1
  }
  return cubos
}

/** Cuántas peticiones llevó cada cupo en el último minuto (para compararlo con su límite). */
export function usoDeCupos(eventos, ahora) {
  const uso = {}
  for (const ev of eventos) if (ev.e === 'inicio' && ahora - ev.t <= 60) uso[ev.cubo] = (uso[ev.cubo] ?? 0) + 1
  return uso
}

export function resumen(eventos, ahora) {
  const fin = terminadas(eventos)
  const reciente = fin.filter((ev) => ahora - ev.t <= 600)
  const ok = fin.filter((ev) => ev.estado < 400)
  const ms = ok.map((ev) => ev.ms).sort((a, b) => a - b)
  return {
    total: fin.length,
    rechazadas: fin.filter((ev) => ev.estado >= 400).length,
    verificadas: ok.filter((ev) => ev.d?.verificado === true).length,
    noCoinciden: ok.filter((ev) => ev.d?.verificado === false).length,
    clientes10min: new Set(reciente.map((ev) => ev.cliente)).size,
    porTunel: fin.filter((ev) => ev.origen === 'tunel').length,
    locales: fin.filter((ev) => ev.origen === 'local').length,
    medianaMs: ms.length ? ms[Math.floor(ms.length / 2)] : null,
    ultima: fin.length ? fin[fin.length - 1].t : null,
  }
}

/** Percentil de una lista ya ordenada. */
export const percentil = (orden, p) => (orden.length ? orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))] : null)
