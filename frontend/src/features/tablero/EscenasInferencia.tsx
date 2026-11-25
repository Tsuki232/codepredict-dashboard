import { memo } from 'react'
import { fmt, fmtInt, fmtP, fmtPct } from '../../lib/format'
import { cubicOut, expoOut, quintInOut, ventana } from '../../motion/tiempo'
import { ANCHO, EjeX, EjeY, PatronRayas, escala, marcas } from '../tstudent/lienzo'
import type { TNeurona, TPermutacion, TWelch } from '../tstudent/tipos'
import { BarraH, COLOR_BUG, MarcoEscena, useK } from './marco'
import type { Pelicula } from './pelicula'
import { DUR, Svg, TipFila, TipTitulo, techo } from './svg'

interface Base { p: Pelicula; i: number; n: number }
const textoP = (p: number) => (p === 0 ? 'p < 10⁻³⁰⁰' : `p = ${fmtP(p)}`)

function Pendiente({ p, i, n, id, titulo, motivo }: Base & { id: string; titulo: string; motivo: string }) {
  const { ref, repetir } = useK(p, i, 1000)
  return (
    <MarcoEscena p={p} i={i} n={n} id={id} titulo={titulo} repetir={repetir} refEscena={ref}>
      <p className="small">{motivo}</p>
    </MarcoEscena>
  )
}

// ───────────────────────────────────────────────────────────── 6 · la t de Welch

export const Welch = memo(function Welch({ p, i, n, w }: Base & { w: TWelch | null }) {
  const { k, ref, repetir } = useK(p, i, DUR.welch)
  if (!w) return <Pendiente p={p} i={i} n={n} id="welch" titulo="La prueba t de Welch" motivo="Todavía no se pudo calcular: aplica la limpieza y vuelve a abrir el tablero." />
  const { con_bug: con, sin_bug: sin } = w.grupos
  const m = { l: 96, r: 40 }
  const tope = techo(Math.max(con.ic_alto, sin.ic_alto) * 1.15)
  const X = escala([0, tope], [m.l, ANCHO - m.r])
  const ea = cubicOut(ventana(k, 0.04, 0.38))
  const fila = (g: typeof con, y: number, color: string, nombre: string) => (
    <g>
      <text x={m.l - 14} y={y + 5} textAnchor="end" fontSize="14" fill="var(--ink-2)">{nombre}</text>
      <line x1={X(g.ic_bajo * ea)} x2={X(g.ic_alto * ea)} y1={y} y2={y} stroke={color} strokeWidth="3" />
      <line x1={X(g.ic_bajo * ea)} x2={X(g.ic_bajo * ea)} y1={y - 8} y2={y + 8} stroke={color} strokeWidth="3" />
      <line x1={X(g.ic_alto * ea)} x2={X(g.ic_alto * ea)} y1={y - 8} y2={y + 8} stroke={color} strokeWidth="3" />
      <circle cx={X(g.media * ea)} cy={y} r="9" fill={color} stroke="var(--paper)" strokeWidth="2.5" />
      <text x={X(g.media * ea)} y={y - 16} textAnchor="middle" fontSize="14" fontWeight="700" fill={color}>{fmt(g.media * ea, 2)}</text>
    </g>
  )
  // La regla de medir: ¿a cuántos errores estándar de cero está la diferencia?
  const aqui = quintInOut(ventana(k, 0.42, 0.78))
  const crit = w.critico
  const izq = Math.min(-3, (crit.bajo ?? -3) - 1)
  const der = Math.max(w.t * 1.08, (crit.alto ?? 3) + 2)
  const R = escala([izq, der], [m.l, ANCHO - m.r])
  const noRechazo: [number, number] = [crit.bajo ?? izq, crit.alto ?? der]
  const marca = w.t * aqui
  const erE = ventana(k, 0.7, 0.9)
  return (
    <MarcoEscena p={p} i={i} n={n} id="welch" titulo="La prueba t de Welch: ¿la diferencia entre medias es real?"
      nota="Compara la complejidad media de los archivos con bug y sin bug sin suponer que sus varianzas son iguales." repetir={repetir} refEscena={ref}
      pie={<>La diferencia de medias es <b>{fmt(w.pasos.diferencia, 2)}</b> y su error estándar <b>{fmt(w.pasos.error_estandar, 3)}</b>, así que t = {fmt(w.pasos.diferencia, 2)} / {fmt(w.pasos.error_estandar, 3)} = <b>{fmt(w.t, 2)}</b> con {fmtInt(w.gl)} grados de libertad (Welch–Satterthwaite); {textoP(w.p)}.
        {' '}Tamaño del efecto ({w.efecto.nombre}): <b>{fmt(w.efecto.valor, 2)}</b>: {Math.abs(w.efecto.valor) < 0.5 ? 'pequeño a moderado' : 'moderado o grande'}; con tantos archivos casi cualquier diferencia sale «significativa», por eso importa más cuánto difieren que el valor p.
        {' '}{w.verificacion.coincide ? 'Comprobado contra SciPy: coincide.' : 'La comprobación contra SciPy NO coincide: no uses estas cifras.'}</>}
      datos={{ cabeza: ['Grupo', 'n', 'Media', 'Desv. estándar', 'IC 95 % de la media'], filas: [['Con bug', fmtInt(con.n), fmt(con.media, 3), fmt(con.sd, 3), `${fmt(con.ic_bajo, 3)} – ${fmt(con.ic_alto, 3)}`], ['Sin bug', fmtInt(sin.n), fmt(sin.media, 3), fmt(sin.sd, 3), `${fmt(sin.ic_bajo, 3)} – ${fmt(sin.ic_alto, 3)}`]] }}>
      <p className="label mb-1">Complejidad media (McCC) de cada grupo, con su intervalo de confianza del 95 %</p>
      <Svg ancho={ANCHO} alto={150} titulo="Medias de cada grupo" descripcion="Un punto con su intervalo de confianza para los archivos con bug y otro para los archivos sin bug.">
        <EjeX X={X} marcasX={marcas(0, tope, 7)} y={118} />
        {fila(con, 36, COLOR_BUG.con, 'Con bug')}
        {fila(sin, 84, COLOR_BUG.sin, 'Sin bug')}
      </Svg>
      <p className="label mb-1 mt-4">¿A cuántos errores estándar de cero está esa diferencia? (la zona gris es lo que se esperaría si no hubiera diferencia real)</p>
      <Svg ancho={ANCHO} alto={184} titulo="La diferencia medida en errores estándar" descripcion={`El estadístico t vale ${fmt(w.t, 1)}; la zona de no rechazo llega hasta ${fmt(crit.alto ?? 0, 2)}.`}>
        <PatronRayas id="rayas-rechazo" color="var(--serie-2)" />
        <rect x={R(izq)} y={44} width={R(noRechazo[0]) - R(izq)} height="42" fill="url(#rayas-rechazo)" opacity={ventana(k, 0.3, 0.5)} />
        <rect x={R(noRechazo[1])} y={44} width={R(der) - R(noRechazo[1])} height="42" fill="url(#rayas-rechazo)" opacity={ventana(k, 0.3, 0.5)} />
        <rect x={R(noRechazo[0])} y={44} width={R(noRechazo[1]) - R(noRechazo[0])} height="42" fill="var(--grid-strong)" fillOpacity="0.55" opacity={ventana(k, 0.3, 0.5)} />
        <EjeX X={R} marcasX={marcas(izq, der, 8)} y={96} etiqueta="t (en errores estándar)" />
        {crit.alto != null && <g opacity={ventana(k, 0.35, 0.55)}><line x1={R(crit.alto)} x2={R(crit.alto)} y1="36" y2="96" stroke="var(--serie-2)" strokeWidth="2" /><text x={R(crit.alto) + 6} y="32" fontSize="12.5" fill="var(--serie-2)">crítico {fmt(crit.alto, 2)}</text></g>}
        {crit.bajo != null && <g opacity={ventana(k, 0.35, 0.55)}><line x1={R(crit.bajo)} x2={R(crit.bajo)} y1="36" y2="96" stroke="var(--serie-2)" strokeWidth="2" /><text x={R(crit.bajo) - 6} y="32" textAnchor="end" fontSize="12.5" fill="var(--serie-2)">crítico {fmt(crit.bajo, 2)}</text></g>}
        <g style={{ transform: `translateX(${R(marca) - R(0)}px)` }}>
          <line x1={R(0)} x2={R(0)} y1="28" y2="96" stroke="var(--ink)" strokeWidth="3" />
          <path d={`M${R(0)},24 l-8,-12 h16 z`} fill="var(--ink)" />
        </g>
        <text x={R(marca) - 14} y="22" textAnchor="end" fontSize="15" fontWeight="700" fill="var(--ink)" opacity={ventana(k, 0.45, 0.6)}>t = {fmt(w.t * aqui, 2)}</text>
        <text x={ANCHO - m.r} y={170} textAnchor="end" fontSize="13.5" fill="var(--ink-2)" opacity={erE}>{textoP(w.p)} → {w.rechaza ? 'se rechaza H₀: las medias no son iguales' : 'no se rechaza H₀'}</text>
      </Svg>
    </MarcoEscena>
  )
})

// ───────────────────────────────────────────────────────────── 7 · permutación: sin fórmulas

const BINES = { min: -5, max: 5, paso: 0.5 }

export const Permutacion = memo(function Permutacion({ p, i, n, perm }: Base & { perm: TPermutacion | null }) {
  const { k, ref, repetir } = useK(p, i, DUR.permutacion)
  if (!perm) return <Pendiente p={p} i={i} n={n} id="permutacion" titulo="La comprobación por permutación" motivo="Todavía no se pudo calcular: aplica la limpieza y vuelve a abrir el tablero." />
  const nb = Math.round((BINES.max - BINES.min) / BINES.paso)
  const cuenta = (hasta: number) => {
    const c = new Array<number>(nb).fill(0)
    let extremos = 0
    for (let j = 0; j < hasta; j++) {
      const v = perm.t_perm[j]
      c[Math.min(nb - 1, Math.max(0, Math.floor((v - BINES.min) / BINES.paso)))]++
      if (Math.abs(v) >= Math.abs(perm.t_obs)) extremos++
    }
    return { c, extremos }
  }
  const final = cuenta(perm.t_perm.length).c
  const ymax = techo(Math.max(...final))
  const hecho = Math.floor(perm.t_perm.length * cubicOut(ventana(k, 0.05, 0.72)))
  const { c: actual, extremos } = cuenta(hecho)
  const ALTO = 360
  const m = { l: 64, r: 30, t: 30, b: 64 }
  const X = escala([BINES.min, BINES.max], [m.l, 640])
  const Y = escala([0, ymax], [ALTO - m.b, m.t])
  const xObs = 880
  const eObs = expoOut(ventana(k, 0.62, 0.84))
  const ancho = X(BINES.min + BINES.paso) - X(BINES.min)
  return (
    <MarcoEscena p={p} i={i} n={n} id="permutacion" titulo="La misma pregunta sin fórmulas: barajar las etiquetas"
      nota="Se reparten al azar las etiquetas «con bug» y «sin bug» entre los archivos y se calcula la t de cada reparto. Si la etiqueta no importara, la t real se parecería a las barajadas." repetir={repetir} refEscena={ref}
      pie={<>De {fmtInt(perm.repeticiones)} repartos al azar (semilla {perm.semilla}), <b>{fmtInt(perm.extremos)}</b> dieron una t tan grande como la real ({fmt(perm.t_obs, 2)}). Con tantas barajadas el valor p más pequeño que se puede obtener es 1/{fmtInt(perm.repeticiones + 1)} = {fmtP(perm.p_minimo)}; aquí p = {fmtP(perm.p)}. Las barajadas se mueven alrededor de 0 con desviación {fmt(perm.sd_perm, 2)} y la mayor llega a {fmt(perm.max_abs_perm, 2)}: la t real está muy lejos de todas.</>}
      datos={{ cabeza: ['Medida', 'Valor'], filas: [['Barajadas', fmtInt(perm.repeticiones)], ['t observada', fmt(perm.t_obs, 3)], ['Barajadas tan extremas', fmtInt(perm.extremos)], ['p de permutación', fmtP(perm.p)], ['Desviación de las barajadas', fmt(perm.sd_perm, 3)], ['Mayor |t| entre las barajadas', fmt(perm.max_abs_perm, 3)]] }}>
      <Svg ancho={ANCHO} alto={ALTO} titulo="t de cada reparto al azar" descripcion={`Histograma de ${perm.repeticiones} valores de t con etiquetas barajadas, centrado en cero, y la t observada ${fmt(perm.t_obs, 1)} muy a la derecha.`}
        interactivo={{
          n: nb, x0: X(BINES.min), banda: ancho,
          contenido: (j) => (
            <>
              <TipTitulo>t entre {fmt(BINES.min + j * BINES.paso, 1)} y {fmt(BINES.min + (j + 1) * BINES.paso, 1)}</TipTitulo>
              <TipFila color="var(--serie-1)"><b>{fmtInt(actual[j])}</b> de {fmtInt(perm.repeticiones)} repartos ({fmtPct(actual[j] / perm.repeticiones)})</TipFila>
            </>
          ),
          resaltar: (j) => <rect x={X(BINES.min + j * BINES.paso)} y={m.t} width={ancho} height={ALTO - m.b - m.t} fill="var(--ink)" opacity="0.07" />,
        }}>
        <EjeY Y={Y} marcasY={marcas(0, ymax, 5)} x={m.l} xFin={640} formato={(v) => fmtInt(v)} etiqueta="repartos" />
        {actual.map((cnt, j) => {
          const h = (ALTO - m.b) - Y(cnt)
          return <rect key={j} x={X(BINES.min + j * BINES.paso) + 1} y={ALTO - m.b - h} width={Math.max(1, ancho - 2)} height={h} fill="var(--serie-1)" fillOpacity="0.8" rx="1.5"><title>{`t entre ${fmt(BINES.min + j * BINES.paso, 1)} y ${fmt(BINES.min + (j + 1) * BINES.paso, 1)}: ${cnt} repartos`}</title></rect>
        })}
        <EjeX X={X} marcasX={marcas(BINES.min, BINES.max, 10)} y={ALTO - m.b} formato={(v) => fmt(v, 0)} etiqueta="t de cada reparto" />
        <g aria-hidden>
          <line x1="662" y1={ALTO - m.b - 8} x2="672" y2={ALTO - m.b + 8} stroke="var(--muted)" strokeWidth="2" />
          <line x1="676" y1={ALTO - m.b - 8} x2="686" y2={ALTO - m.b + 8} stroke="var(--muted)" strokeWidth="2" />
          <line x1="686" x2={ANCHO - m.r} y1={ALTO - m.b} y2={ALTO - m.b} stroke="var(--grid-strong)" />
        </g>
        <g style={{ opacity: eObs, transform: `translateY(${(1 - eObs) * -24}px)` }}>
          <line x1={xObs} x2={xObs} y1={m.t + 20} y2={ALTO - m.b} stroke="var(--serie-2)" strokeWidth="4" />
          <circle cx={xObs} cy={m.t + 20} r="8" fill="var(--serie-2)" />
          <text x={xObs} y={m.t + 2} textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--serie-2)">t real = {fmt(perm.t_obs, 1)}</text>
          <text x={xObs} y={m.t + 56} textAnchor="middle" fontSize="12.5" fill="var(--ink-2)">(fuera de la escala)</text>
        </g>
        <text x={m.l + 12} y={m.t + 4} fontSize="14" fontWeight="700" fill="var(--ink)">Repartos hechos: {fmtInt(hecho)} de {fmtInt(perm.repeticiones)}</text>
        <text x={m.l + 12} y={m.t + 24} fontSize="13.5" fill="var(--ink-2)">tan extremos como el real: {fmtInt(extremos)}</text>
      </Svg>
    </MarcoEscena>
  )
})

// ───────────────────────────────────────────────────────────── 8 · una neurona predice

export const Neurona = memo(function Neurona({ p, i, n, neu }: Base & { neu: TNeurona | null }) {
  const { k, ref, repetir } = useK(p, i, DUR.neurona)
  if (!neu) return <Pendiente p={p} i={i} n={n} id="neurona" titulo="Una sola neurona que predice el bug" motivo="Todavía no se pudo calcular: aplica la limpieza y vuelve a abrir el tablero." />
  const pts = neu.roc?.puntos
  const u = neu.umbral
  const triv = neu.regla_trivial?.exactitud
  const AN = 520
  const AL = 440
  const o = { x: 76, y: 24, s: 360 }
  const X = escala([0, 1], [o.x, o.x + o.s])
  const Y = escala([0, 1], [o.y + o.s, o.y])
  const q = quintInOut(ventana(k, 0.08, 0.7))
  let trazo = ''
  let area = ''
  if (pts && pts.length > 1) {
    const pos = q * (pts.length - 1)
    const entero = Math.floor(pos)
    const vis = pts.slice(0, entero + 1).map((a) => [a.fpr, a.tpr] as [number, number])
    if (entero < pts.length - 1) {
      const a = pts[entero]
      const b = pts[entero + 1]
      const f = pos - entero
      vis.push([a.fpr + (b.fpr - a.fpr) * f, a.tpr + (b.tpr - a.tpr) * f])
    }
    trazo = vis.map(([x, y], j) => `${j ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('')
    area = `${trazo}L${X(vis[vis.length - 1][0]).toFixed(1)},${Y(0).toFixed(1)}L${X(0).toFixed(1)},${Y(0).toFixed(1)}Z`
  }
  const auc = neu.auc_prueba * expoOut(ventana(k, 0.1, 0.72))
  const eB = ventana(k, 0.6, 0.85)
  const mejora = u && triv != null ? (u.exactitud - triv) * 100 : null
  return (
    <MarcoEscena p={p} i={i} n={n} id="neurona" titulo="Una sola neurona que predice el bug a partir de la complejidad"
      nota={`P(bug) = sigmoide(w·z + b), con z = log(1 + McCC) estandarizado. Se entrenó con el 80 % de los archivos (descenso de gradiente) y se evalúa con el 20 % que nunca vio (${fmtInt(neu.n_prueba)} archivos). Se comprobó con Newton–Raphson${neu.verificacion.coincide ? ': coincide' : ': NO coincide'}.`}
      repetir={repetir} refEscena={ref}
      pie={<>El AUC dice qué tan bien ordena el modelo: {fmt(neu.auc_prueba, 2)} significa que, tomando al azar un archivo con bug y otro sin bug, el modelo le da más probabilidad al que tiene bug el {fmtPct(neu.auc_prueba, 0)} de las veces (0,50 sería tirar una moneda). Es una señal real pero <b>modesta</b>{mejora != null && <>: con el umbral 0,5 acierta {fmt(u!.exactitud * 100, 1)} % de los archivos y la regla trivial «decir siempre sin bug» acierta {fmt(triv! * 100, 1)} %, es decir, {mejora >= 0 ? `${fmt(mejora, 1)} puntos más` : `${fmt(-mejora, 1)} puntos menos`} que no hacer nada</>}. Una sola variable no basta para predecir bugs.</>}
      datos={{ cabeza: ['Medida', 'Valor'], filas: [['AUC (20 % de prueba)', fmt(neu.auc_prueba, 4)], ['AUC (80 % de entrenamiento)', fmt(neu.auc_entrenamiento, 4)], ...(u ? [['Exactitud con umbral 0,5', fmtPct(u.exactitud)], ['Verdaderos positivos', fmtInt(u.vp)], ['Falsos positivos', fmtInt(u.fp)], ['Falsos negativos', fmtInt(u.fn)], ['Verdaderos negativos', fmtInt(u.vn)]] : []), ...(triv != null ? [['Exactitud de la regla trivial', fmtPct(triv)]] : [])] }}>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {pts ? (
          <Svg ancho={AN} alto={AL} minimo={380} maximo={520} titulo="Curva ROC de la neurona" descripcion={`La curva sube por encima de la diagonal; el área bajo ella (AUC) es ${fmt(neu.auc_prueba, 2)}.`}>
            <rect x={o.x} y={o.y} width={o.s} height={o.s} fill="var(--paper)" stroke="var(--grid-strong)" />
            {marcas(0, 1, 4).map((v) => (
              <g key={v} aria-hidden>
                <line x1={X(v)} x2={X(v)} y1={o.y} y2={o.y + o.s} stroke="var(--grid)" strokeDasharray="2 5" />
                <line x1={o.x} x2={o.x + o.s} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" strokeDasharray="2 5" />
                <text x={X(v)} y={o.y + o.s + 20} textAnchor="middle" fontSize="12.5" fill="var(--muted)">{fmt(v, 2)}</text>
                <text x={o.x - 10} y={Y(v) + 4} textAnchor="end" fontSize="12.5" fill="var(--muted)">{fmt(v, 2)}</text>
              </g>
            ))}
            <line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(1)} stroke="var(--serie-3)" strokeWidth="1.8" strokeDasharray="7 6" />
            <text x={X(0.52)} y={Y(0.44)} fontSize="12.5" fill="var(--ink-2)" transform={`rotate(-45 ${X(0.52)} ${Y(0.44)})`}>azar (AUC 0,50)</text>
            <path d={area} fill="var(--serie-1)" fillOpacity="0.14" />
            <path d={trazo} fill="none" stroke="var(--serie-1)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
            <text x={o.x + o.s / 2} y={AL - 8} textAnchor="middle" fontSize="13" fill="var(--ink-2)">archivos sin bug marcados por error (falsos positivos)</text>
            <text transform={`translate(18 ${o.y + o.s / 2}) rotate(-90)`} textAnchor="middle" fontSize="13" fill="var(--ink-2)">archivos con bug detectados</text>
            <text x={X(0.98)} y={Y(0.18)} textAnchor="end" fontSize="26" fontWeight="700" fill="var(--serie-1)">AUC {fmt(auc, 2)}</text>
          </Svg>
        ) : (
          <p className="small">La curva ROC no llegó del servidor: reinicia el servidor del panel para cargar la versión nueva.</p>
        )}
        <div className="flex flex-col gap-5" style={{ opacity: pts ? eB : 1 }}>
          {u && triv != null && (
            <div>
              <p className="mb-2 font-semibold">Exactitud: ¿acierta más que no hacer nada?</p>
              <div className="grid gap-2">
                <div><div className="flex justify-between text-[0.9375rem]"><span>Neurona (umbral 0,5)</span><b>{fmtPct(u.exactitud)}</b></div><BarraH frac={u.exactitud} k={eB} color="var(--serie-1)" /></div>
                <div><div className="flex justify-between text-[0.9375rem]"><span>Regla trivial: «siempre sin bug»</span><b>{fmtPct(triv)}</b></div><BarraH frac={triv} k={eB} color="var(--serie-3)" /></div>
              </div>
            </div>
          )}
          {u && (
            <div>
              <p className="mb-2 font-semibold">Matriz de confusión (archivos de prueba)</p>
              <div className="grid max-w-[22rem] grid-cols-[auto_1fr_1fr] gap-px overflow-hidden rounded-md text-center text-[0.9375rem]" style={{ background: 'var(--rule)' }}>
                <span style={{ background: 'var(--paper)' }} />
                <span className="py-1.5 small" style={{ background: 'var(--paper)' }}>Predice bug</span>
                <span className="py-1.5 small" style={{ background: 'var(--paper)' }}>Predice sin bug</span>
                <span className="px-2 py-2 small text-left" style={{ background: 'var(--paper)' }}>Tiene bug</span>
                <b className="py-2" style={{ background: 'color-mix(in srgb, var(--ok) 14%, var(--paper))' }}>{fmtInt(u.vp)}</b>
                <b className="py-2" style={{ background: 'color-mix(in srgb, var(--serie-2) 12%, var(--paper))' }}>{fmtInt(u.fn)}</b>
                <span className="px-2 py-2 small text-left" style={{ background: 'var(--paper)' }}>No tiene</span>
                <b className="py-2" style={{ background: 'color-mix(in srgb, var(--serie-2) 12%, var(--paper))' }}>{fmtInt(u.fp)}</b>
                <b className="py-2" style={{ background: 'color-mix(in srgb, var(--ok) 14%, var(--paper))' }}>{fmtInt(u.vn)}</b>
              </div>
              <p className="small mt-2">Precisión {u.precision != null ? fmtPct(u.precision) : '—'} · sensibilidad {u.sensibilidad != null ? fmtPct(u.sensibilidad) : '—'} · F1 {u.f1 != null ? fmt(u.f1, 2) : '—'}</p>
            </div>
          )}
        </div>
      </div>
    </MarcoEscena>
  )
})
