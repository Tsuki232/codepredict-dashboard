import { memo } from 'react'
import { fmt, fmtInt, fmtPct } from '../../lib/format'
import { cubicOut, escalon, expoOut, quintInOut, ventana } from '../../motion/tiempo'
import { ANCHO, EjeX, EjeY, PatronRayas, escala, marcas } from '../tstudent/lienzo'
import { COLOR_BUG, MarcoEscena, useK } from './marco'
import type { Pelicula } from './pelicula'
import { DUR, Svg, TipFila, TipTitulo, techo } from './svg'
import type { TTablero } from './tipos'

interface Base { p: Pelicula; i: number; n: number }

// ───────────────────────────────────────────────────────────── 2 · embudo de limpieza

export const Embudo = memo(function Embudo({ p, i, n, tab }: Base & { tab: TTablero }) {
  const { k, ref, repetir } = useK(p, i, DUR.embudo)
  const pasos = tab.embudo
  const base = Math.max(1, pasos[0]?.antes ?? 1)
  return (
    <MarcoEscena p={p} i={i} n={n} id="embudo" titulo="De los datos crudos a los archivos que se analizan"
      nota="Cada regla de limpieza quita filas por una razón escrita; la parte rayada es lo que se quitó en ese paso." repetir={repetir} refEscena={ref}
      pie={<>Las reglas, los conteos de cada paso y la huella SHA-256 del archivo limpio (<code>{tab.meta.sha256.slice(0, 12)}…</code>) quedan guardados en el manifiesto, así que el resultado se puede reproducir.</>}
      datos={{ cabeza: ['Paso', 'Antes', 'Después', 'Quitadas'], filas: pasos.map((s) => [s.etiqueta, fmtInt(s.antes), fmtInt(s.despues), fmtInt(s.quitadas)]) }}>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {pasos.map((s, j) => {
          const e = cubicOut(escalon(k, j, pasos.length, 0.34, 0, 0.8))
          const fin = Math.min(1, s.despues / base)
          const quitado = Math.min(1 - fin, s.quitadas / base)
          return (
            <li key={s.id} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_9.5rem]" style={{ opacity: 0.25 + 0.75 * e }}>
              <span className="small" style={{ color: 'var(--ink)' }}>{s.etiqueta}</span>
              <div className="barra-pista" style={{ height: 16 }}>
                <div style={{ display: 'flex', height: '100%', width: '100%', transform: `scaleX(${e})`, transformOrigin: 'left' }}>
                  <div style={{ width: `${fin * 100}%`, background: 'var(--serie-1)' }} />
                  <div style={{ width: `${quitado * 100}%`, background: 'repeating-linear-gradient(45deg, var(--serie-2) 0 3px, color-mix(in srgb, var(--serie-2) 30%, transparent) 3px 6px)' }} />
                </div>
              </div>
              <span className="text-right text-[0.9375rem] font-semibold">
                {fmtInt(s.antes + (s.despues - s.antes) * e)}
                {s.quitadas > 0 && <span style={{ color: 'var(--serie-2)', fontWeight: 500 }}> −{fmtInt(s.quitadas * e)}</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </MarcoEscena>
  )
})

// ───────────────────────────────────────────────────────────── 3 · distribución de la complejidad

export const Distribucion = memo(function Distribucion({ p, i, n, tab }: Base & { tab: TTablero }) {
  const { k, ref, repetir } = useK(p, i, DUR.distribucion)
  const tr = tab.histograma
  const ALTO = 360
  const m = { l: 64, r: 24, t: 24, b: 64 }
  const ymax = techo(Math.max(...tr.flatMap((t) => [t.parte_con_bug, t.parte_sin_bug])))
  const Y = escala([0, ymax], [ALTO - m.b, m.t])
  const banda = (ANCHO - m.l - m.r) / tr.length
  const corte = tr.findIndex((t) => t.tramo === '10')
  const { con_bug: con, sin_bug: sin } = tab.cajas

  // Cajas: el eje llega al bigote más largo (los atípicos se cuentan, no se dibujan).
  const tope = Math.max(con.bigote_alto, sin.bigote_alto) * 1.12
  const X = escala([0, tope], [m.l, ANCHO - m.r])
  const ec = cubicOut(ventana(k, 0.62, 0.95))
  const caja = (c: typeof con, y: number, color: string, nombre: string, hacia: number) => (
    <g style={{ opacity: ec, transform: `translateX(${(1 - ec) * 30 * hacia}px)` }}>
      <text x={m.l - 10} y={y + 5} textAnchor="end" fontSize="13" fill="var(--ink-2)">{nombre}</text>
      <line x1={X(c.bigote_bajo)} x2={X(c.bigote_alto)} y1={y} y2={y} stroke={color} strokeWidth="2" />
      <line x1={X(c.bigote_bajo)} x2={X(c.bigote_bajo)} y1={y - 7} y2={y + 7} stroke={color} strokeWidth="2" />
      <line x1={X(c.bigote_alto)} x2={X(c.bigote_alto)} y1={y - 7} y2={y + 7} stroke={color} strokeWidth="2" />
      <rect x={X(c.q1)} y={y - 15} width={Math.max(2, X(c.q3) - X(c.q1))} height="30" rx="3" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="2" />
      <line x1={X(c.mediana)} x2={X(c.mediana)} y1={y - 15} y2={y + 15} stroke={color} strokeWidth="4" />
      <path d={`M${X(c.media)},${y - 8}L${X(c.media) + 7},${y}L${X(c.media)},${y + 8}L${X(c.media) - 7},${y}Z`} fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
      {c.atipicos > 0 && <text x={X(c.bigote_alto)} y={y - 22} textAnchor="end" fontSize="12" fill="var(--muted)">+ {fmtInt(c.atipicos)} atípicos más allá del bigote</text>}
    </g>
  )

  return (
    <MarcoEscena p={p} i={i} n={n} id="distribucion" titulo="Cómo se reparte la complejidad ciclomática (McCC)"
      nota="Cada barra es el porcentaje de los archivos de su grupo que cae en ese tramo de McCC; la línea punteada marca el corte de «compleja» (McCC > 10)." repetir={repetir} refEscena={ref}
      pie={<>Mediana con bug: <b>{fmt(con.mediana, 0)}</b> · sin bug: <b>{fmt(sin.mediana, 0)}</b>. Media con bug: <b>{fmt(con.media, 1)}</b> (♦) · sin bug: <b>{fmt(sin.media, 1)}</b>. La complejidad tiene cola larga hacia arriba: por eso se mira también la mediana y no solo la media.</>}
      datos={{ cabeza: ['Tramo de McCC', 'Sin bug', 'Con bug', '% del grupo sin bug', '% del grupo con bug'], filas: tr.map((t) => [t.tramo, fmtInt(t.sin_bug), fmtInt(t.con_bug), fmtPct(t.parte_sin_bug), fmtPct(t.parte_con_bug)]) }}>
      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[0.875rem]" aria-hidden>
        <span><span className="mr-1.5 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: COLOR_BUG.sin }} />Sin bug ({fmtInt(sin.n)})</span>
        <span><span className="mr-1.5 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: 'repeating-linear-gradient(45deg, var(--serie-2) 0 3px, color-mix(in srgb, var(--serie-2) 35%, transparent) 3px 6px)', border: '1px solid var(--serie-2)' }} />Con bug ({fmtInt(con.n)})</span>
      </div>
      <Svg ancho={ANCHO} alto={ALTO} titulo="Distribución de la complejidad por grupo" descripcion="Barras agrupadas con el porcentaje de archivos con y sin bug en cada tramo de complejidad ciclomática."
        interactivo={{
          n: tr.length, x0: m.l, banda,
          contenido: (j) => (
            <>
              <TipTitulo>McCC {tr[j].tramo}</TipTitulo>
              <TipFila color={COLOR_BUG.sin}>Sin bug: <b>{fmtPct(tr[j].parte_sin_bug)}</b> ({fmtInt(tr[j].sin_bug)} archivos)</TipFila>
              <TipFila color={COLOR_BUG.con}>Con bug: <b>{fmtPct(tr[j].parte_con_bug)}</b> ({fmtInt(tr[j].con_bug)} archivos)</TipFila>
            </>
          ),
          resaltar: (j) => <rect x={m.l + j * banda} y={m.t} width={banda} height={ALTO - m.b - m.t} fill="var(--ink)" opacity="0.07" />,
        }}>
        <PatronRayas id="rayas-con-bug" color="var(--serie-2)" />
        <EjeY Y={Y} marcasY={marcas(0, ymax, 5)} x={m.l} xFin={ANCHO - m.r} formato={(v) => `${Math.round(v * 100)} %`} etiqueta="% de los archivos del grupo" />
        {tr.map((t, j) => {
          const e = cubicOut(escalon(k, j, tr.length, 0.4, 0, 0.6))
          const x0 = m.l + j * banda
          const base = ALTO - m.b
          const hs = (base - Y(t.parte_sin_bug)) * e
          const hc = (base - Y(t.parte_con_bug)) * e
          return (
            <g key={t.tramo}>
              <title>{`McCC ${t.tramo}: ${fmtPct(t.parte_sin_bug)} de los archivos sin bug y ${fmtPct(t.parte_con_bug)} de los archivos con bug`}</title>
              <rect x={x0 + banda * 0.1} y={base - hs} width={banda * 0.38} height={hs} rx="2" fill={COLOR_BUG.sin} />
              <rect x={x0 + banda * 0.52} y={base - hc} width={banda * 0.38} height={hc} rx="2" fill="url(#rayas-con-bug)" stroke={COLOR_BUG.con} strokeWidth="1.5" />
              <text x={x0 + banda / 2} y={base + 18} textAnchor="middle" fontSize="12.5" fill="var(--muted)">{t.tramo}</text>
            </g>
          )
        })}
        <text x={(m.l + ANCHO - m.r) / 2} y={ALTO - 14} textAnchor="middle" fontSize="13" fill="var(--ink-2)">McCC por archivo</text>
        {corte >= 0 && corte < tr.length - 1 && (
          <g style={{ opacity: ventana(k, 0.5, 0.7) }}>
            <line x1={m.l + (corte + 1) * banda} x2={m.l + (corte + 1) * banda} y1={m.t} y2={ALTO - m.b} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="5 5" />
            <text x={m.l + (corte + 1) * banda + 8} y={m.t + 12} fontSize="12.5" fontWeight="600" fill="var(--ink)">McCC &gt; {tab.meta.umbral_compleja}: «compleja»</text>
          </g>
        )}
      </Svg>
      <p className="label mb-1 mt-5">Resumen por grupo: caja = del 25 % al 75 % de los archivos, línea gruesa = mediana, ♦ = media, bigotes = hasta 1,5 veces el rango intercuartílico</p>
      <Svg ancho={ANCHO} alto={150} titulo="Cajas de la complejidad por grupo" descripcion="Una caja con bigotes para los archivos con bug y otra para los archivos sin bug.">
        <EjeX X={X} marcasX={marcas(0, tope, 7)} y={110} />
        {caja(con, 38, COLOR_BUG.con, 'Con bug', 1)}
        {caja(sin, 78, COLOR_BUG.sin, 'Sin bug', -1)}
      </Svg>
    </MarcoEscena>
  )
})

// ───────────────────────────────────────────────────────────── 4 · el riesgo sube con la complejidad

export const Riesgo = memo(function Riesgo({ p, i, n, tab }: Base & { tab: TTablero }) {
  const { k, ref, repetir } = useK(p, i, DUR.riesgo)
  const rs = tab.riesgo
  const ALTO = 380
  const m = { l: 64, r: 28, t: 28, b: 64 }
  const ymax = Math.min(1, techo(Math.max(...rs.map((r) => r.ic95[1]))))
  const Y = escala([0, ymax], [ALTO - m.b, m.t])
  const banda = (ANCHO - m.l - m.r) / rs.length
  const Xj = (j: number) => m.l + (j + 0.5) * banda
  const q = quintInOut(ventana(k, 0.08, 0.74))
  const frente = m.l + q * (ANCHO - m.l - m.r) + 4                   // hasta dónde llega el dibujo
  const trazo = rs.map((r, j) => `${j ? 'L' : 'M'}${Xj(j).toFixed(1)},${Y(r.tasa).toFixed(1)}`).join('')
  const base = tab.kpis.tasa_bug
  const primero = rs[0]
  const ultimo = rs[rs.length - 1]
  return (
    <MarcoEscena p={p} i={i} n={n} id="riesgo" titulo="El riesgo de tener un bug sube con la complejidad"
      nota="Para cada tramo de McCC: qué fracción de los archivos tiene al menos un bug, con su intervalo de confianza del 95 % (Wilson)." repetir={repetir} refEscena={ref}
      pie={<>Entre los archivos del tramo «{primero.tramo}» el {fmtPct(primero.tasa)} tiene bug; entre los de «{ultimo.tramo}», el {fmtPct(ultimo.tasa)}. Es una <b>asociación</b> observada en estos datos: no prueba que la complejidad cause los bugs (un archivo grande también tiene más oportunidades de fallar y de que alguien lo revise).</>}
      datos={{ cabeza: ['Tramo de McCC', 'Archivos', 'Con bug', '% con bug', 'IC 95 %'], filas: rs.map((r) => [r.tramo, fmtInt(r.n), fmtInt(r.con_bug), fmtPct(r.tasa), `${fmtPct(r.ic95[0])} – ${fmtPct(r.ic95[1])}`]) }}>
      <Svg ancho={ANCHO} alto={ALTO} titulo="Riesgo de bug por tramo de complejidad" descripcion="Una línea que sube con la complejidad, con el intervalo de confianza de cada punto y la tasa general como referencia."
        interactivo={{
          n: rs.length, x0: m.l, banda,
          contenido: (j) => (
            <>
              <TipTitulo>McCC {rs[j].tramo}</TipTitulo>
              <TipFila color="var(--serie-2)"><b>{fmtPct(rs[j].tasa)}</b> con bug ({fmtInt(rs[j].con_bug)} de {fmtInt(rs[j].n)})</TipFila>
              <TipFila>IC 95 %: {fmtPct(rs[j].ic95[0])} a {fmtPct(rs[j].ic95[1])}</TipFila>
              <TipFila>{rs[j].tasa >= base ? 'por encima' : 'por debajo'} de la tasa general ({fmtPct(base)})</TipFila>
            </>
          ),
          resaltar: (j) => (
            <>
              <rect x={m.l + j * banda} y={m.t} width={banda} height={ALTO - m.b - m.t} fill="var(--ink)" opacity="0.07" />
              <line x1={Xj(j)} x2={Xj(j)} y1={m.t} y2={ALTO - m.b} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx={Xj(j)} cy={Y(rs[j].tasa)} r="9" fill="none" stroke="var(--serie-2)" strokeWidth="3" />
            </>
          ),
        }}>
        <defs><clipPath id="clip-riesgo"><rect x="0" y="0" width={Math.max(0, frente)} height={ALTO} /></clipPath></defs>
        <EjeY Y={Y} marcasY={marcas(0, ymax, 5)} x={m.l} xFin={ANCHO - m.r} formato={(v) => `${Math.round(v * 100)} %`} etiqueta="% de archivos con bug" />
        <line x1={m.l} x2={ANCHO - m.r} y1={Y(base)} y2={Y(base)} stroke="var(--serie-3)" strokeWidth="1.8" strokeDasharray="7 6" />
        <text x={ANCHO - m.r} y={Y(base) - 8} textAnchor="end" fontSize="13" fill="var(--ink-2)">tasa general {fmtPct(base)}</text>
        <g clipPath="url(#clip-riesgo)">
          <path d={trazo} fill="none" stroke="var(--serie-2)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {rs.map((r, j) => (
            <g key={r.tramo}>
              <title>{`McCC ${r.tramo}: ${fmtPct(r.tasa)} con bug (IC 95 %: ${fmtPct(r.ic95[0])} a ${fmtPct(r.ic95[1])}) · ${fmtInt(r.n)} archivos`}</title>
              <line x1={Xj(j)} x2={Xj(j)} y1={Y(r.ic95[0])} y2={Y(r.ic95[1])} stroke="var(--serie-2)" strokeWidth="2" opacity="0.6" />
              <line x1={Xj(j) - 5} x2={Xj(j) + 5} y1={Y(r.ic95[0])} y2={Y(r.ic95[0])} stroke="var(--serie-2)" strokeWidth="2" opacity="0.6" />
              <line x1={Xj(j) - 5} x2={Xj(j) + 5} y1={Y(r.ic95[1])} y2={Y(r.ic95[1])} stroke="var(--serie-2)" strokeWidth="2" opacity="0.6" />
              <circle cx={Xj(j)} cy={Y(r.tasa)} r="6.5" fill="var(--paper)" stroke="var(--serie-2)" strokeWidth="3" />
            </g>
          ))}
        </g>
        {rs.map((r, j) => <text key={r.tramo} x={Xj(j)} y={ALTO - m.b + 20} textAnchor="middle" fontSize="12.5" fill="var(--muted)">{r.tramo}</text>)}
        <text x={(m.l + ANCHO - m.r) / 2} y={ALTO - 14} textAnchor="middle" fontSize="13" fill="var(--ink-2)">McCC por archivo</text>
        {[primero, ultimo].map((r, idx) => {
          const j = idx ? rs.length - 1 : 0
          return <text key={r.tramo} x={Xj(j)} y={Y(r.tasa) - 16} textAnchor={idx ? 'end' : 'start'} fontSize="14" fontWeight="700" fill="var(--serie-2)" style={{ opacity: ventana(frente, Xj(j) - 10, Xj(j) + 30) }}>{fmtPct(r.tasa)}</text>
        })}
      </Svg>
    </MarcoEscena>
  )
})

// ───────────────────────────────────────────────────────────── 5 · probabilidad, dependencia y Bayes

export const Probabilidad = memo(function Probabilidad({ p, i, n, tab }: Base & { tab: TTablero }) {
  const { k, ref, repetir } = useK(p, i, DUR.probabilidad)
  const t = tab.tabla
  const umbral = tab.meta.umbral_compleja
  const AN = 600
  const AL = 400
  const o = { x: 56, y: 22, w: 500, h: 300 }
  const e1 = cubicOut(ventana(k, 0.04, 0.3))
  const e2 = cubicOut(ventana(k, 0.3, 0.6))
  const e3 = ventana(k, 0.56, 0.76)
  const wNC = (1 - t.p_c) * o.w * e1
  const wC = t.p_c * o.w * e1
  const gap = 4
  const columna = (x: number, ancho: number, pD: number, cD: number, cND: number, nombre: string) => (
    <g>
      <rect x={x} y={o.y} width={Math.max(0, ancho - gap)} height={pD * o.h * e2} fill="url(#rayas-mosaico)" stroke={COLOR_BUG.con} strokeWidth="2" />
      <rect x={x} y={o.y + pD * o.h * e2} width={Math.max(0, ancho - gap)} height={o.h - pD * o.h * e2} fill={COLOR_BUG.sin} fillOpacity="0.22" stroke={COLOR_BUG.sin} strokeWidth="2" />
      <g style={{ opacity: e3 }}>
        <text x={x + (ancho - gap) / 2} y={o.y + (pD * o.h) / 2 + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--ink)">{fmtInt(cD)}</text>
        <text x={x + (ancho - gap) / 2} y={o.y + pD * o.h + (o.h - pD * o.h) / 2 + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--ink)">{fmtInt(cND)}</text>
        <text x={x + (ancho - gap) / 2} y={o.y + o.h + 22} textAnchor="middle" fontSize="13.5" fill="var(--ink-2)">{nombre}</text>
      </g>
    </g>
  )
  const filas: [string, string, string?][] = [
    ['P(bug) en cualquier archivo', fmtPct(t.p_d * expoOut(ventana(k, 0.35, 0.65)))],
    ['P(compleja)', fmtPct(t.p_c * expoOut(ventana(k, 0.4, 0.7)))],
    ['P(bug | compleja)', fmtPct(t.p_d_dado_c * expoOut(ventana(k, 0.45, 0.75))), 'var(--serie-2)'],
    ['P(bug | no compleja)', fmtPct(t.p_d_dado_nc * expoOut(ventana(k, 0.5, 0.8))), 'var(--serie-1)'],
    ['Razón de riesgo', `${fmt(t.razon_de_riesgo * expoOut(ventana(k, 0.55, 0.85)), 2)}×`],
    ['Razón de momios (odds ratio)', `${fmt(t.odds_ratio * expoOut(ventana(k, 0.6, 0.9)), 2)}  (IC 95 %: ${fmt(t.or_ic95[0], 2)} – ${fmt(t.or_ic95[1], 2)})`],
  ]
  return (
    <MarcoEscena p={p} i={i} n={n} id="probabilidad" titulo="Probabilidades: ¿«compleja» y «con bug» son independientes?"
      nota={`Cada archivo se clasifica por dos sucesos: «compleja» (McCC > ${umbral}) y «con bug». El mosaico reparte los ${fmtInt(t.n)} archivos: el ancho de cada columna es la fracción de archivos de ese tipo y la altura rayada, la fracción con bug dentro de ella.`}
      repetir={repetir} refEscena={ref}
      pie={<>Si los dos sucesos fueran independientes, P(bug | compleja) sería igual a P(bug) = {fmtPct(t.p_d)}; en cambio vale {fmtPct(t.p_d_dado_c)}, así que <b>son dependientes</b>. Con el teorema de Bayes se invierte la pregunta: P(compleja | bug) = P(bug | compleja) · P(compleja) / P(bug) = {fmt(t.p_d_dado_c, 4)} · {fmt(t.p_c, 4)} / {fmt(t.p_d, 4)} = <b>{fmt(t.p_c_dado_d, 4)}</b>; contando directamente los archivos con bug que son complejos sale {fmt(t.p_c_dado_d_directa, 4)} ({t.bayes_coincide ? 'coincide' : 'no coincide'}).</>}
      datos={{ cabeza: ['', 'Con bug', 'Sin bug'], filas: [[`Compleja (McCC > ${umbral})`, fmtInt(t.celdas.C_D), fmtInt(t.celdas.C_ND)], ['No compleja', fmtInt(t.celdas.NC_D), fmtInt(t.celdas.NC_ND)]] }}>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Svg ancho={AN} alto={AL} minimo={420} maximo={560} titulo="Mosaico de la tabla 2×2" descripcion="Dos columnas, archivos no complejos y complejos; cada una dividida en con bug (rayado, arriba) y sin bug (abajo).">
          <PatronRayas id="rayas-mosaico" color="var(--serie-2)" />
          {columna(o.x, wNC, t.p_d_dado_nc, t.celdas.NC_D, t.celdas.NC_ND, `No compleja (McCC ≤ ${umbral})`)}
          {columna(o.x + wNC, wC, t.p_d_dado_c, t.celdas.C_D, t.celdas.C_ND, `Compleja (McCC > ${umbral})`)}
          <text transform={`translate(18 ${o.y + o.h / 2}) rotate(-90)`} textAnchor="middle" fontSize="13" fill="var(--ink-2)" style={{ opacity: e3 }}>arriba con bug · abajo sin bug</text>
        </Svg>
        <dl className="readout self-center" style={{ gap: 10 }}>
          {filas.map(([et, v, c]) => (
            <div key={et}><dt>{et}</dt><span className="dots" aria-hidden /><dd style={{ color: c }}>{v}</dd></div>
          ))}
        </dl>
      </div>
    </MarcoEscena>
  )
})
