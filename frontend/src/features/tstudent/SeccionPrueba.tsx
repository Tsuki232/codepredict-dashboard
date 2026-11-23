import { useMemo, useState } from 'react'
import { fmtP } from '../../lib/format'
import { curva, tPdf } from '../../lib/tdist'
import { Panel } from '../../ui/Panel'
import { Verified } from '../../ui/Verified'
import { useReproduccion, useSuave } from './animacion'
import { ALTO, ANCHO, ComoLeerla, EjeX, EjeY, Lienzo, MARGEN, PatronRayas, areaBajo, escala, marcas, num, ruta } from './lienzo'
import type { TWelch } from './tipos'

const SIGNO = { 'two-sided': '≠', greater: '>', less: '<' } as const
const efectoTexto = (g: number) => { const a = Math.abs(g); return a < 0.2 ? 'insignificante' : a < 0.5 ? 'pequeño' : a < 0.8 ? 'mediano' : 'grande' }

/** 3. La prueba t de Welch, paso a paso, con los números reales, y la campana donde cae la t. */
export function SeccionPrueba({ w }: { w: TWelch }) {
  const { k, reproducir, ref } = useReproduccion(6500)
  const [alejar, setAlejar] = useState(false)
  const paso = k >= 1 ? 5 : Math.min(5, Math.floor(k * 6))
  const tAbs = Math.abs(w.t)
  const xm = useSuave(alejar ? Math.max(30, tAbs * 1.12) : 4.6, 1100)
  const { con_bug: a, sin_bug: b } = w.grupos
  const p = w.pasos
  const signo = SIGNO[w.alternativa]

  const X = escala([-xm, xm], [MARGEN.l, ANCHO - MARGEN.r])
  const ymax = tPdf(0, w.gl) * 1.18
  const Y = escala([0, ymax], [ALTO - MARGEN.b, MARGEN.t])
  const pts = useMemo(() => curva((u) => tPdf(u, w.gl), -xm, xm, 700), [w.gl, xm])
  const fueraDeVista = tAbs > xm
  const xt = Math.max(-xm * 0.985, Math.min(xm * 0.985, w.t))
  const zonas: [number, number][] = []
  if (w.critico.bajo !== null) zonas.push([-xm, Math.min(w.critico.bajo, xm)])
  if (w.critico.alto !== null) zonas.push([Math.max(w.critico.alto, -xm), xm])

  const filas: { titulo: string; formula: string; nota?: string }[] = [
    { titulo: 'Las hipótesis', formula: `H₀: μ₁ = μ₂   (no hay diferencia de complejidad)\nH₁: μ₁ ${signo} μ₂   (μ₁ = con bug, μ₂ = sin bug)`, nota: `Se decide con un nivel de significancia α = ${num(w.alpha, 2)}.` },
    { titulo: 'La diferencia de medias', formula: `x̄₁ − x̄₂ = ${num(a.media, 2)} − ${num(b.media, 2)} = ${num(p.diferencia, 2)}`, nota: 'Es lo que queremos saber si es «grande» o solo ruido.' },
    { titulo: 'Su error estándar (cuánto «ruido» esperamos)', formula: `EE = √( s₁²/n₁ + s₂²/n₂ ) = √( ${num(a.sd, 2)}²/${a.n.toLocaleString('es-CO')} + ${num(b.sd, 2)}²/${b.n.toLocaleString('es-CO')} )\n   = √( ${num(p.termino_1, 4)} + ${num(p.termino_2, 4)} ) = ${num(p.error_estandar, 4)}`, nota: 'Cada grupo aporta su propia dispersión: por eso no se suponen varianzas iguales (esa es la parte «Welch»).' },
    { titulo: 'El estadístico t', formula: `t = (x̄₁ − x̄₂) / EE = ${num(p.diferencia, 2)} / ${num(p.error_estandar, 4)} = ${num(w.t, 4)}`, nota: `La diferencia vale ${num(tAbs, 1)} veces su error estándar.` },
    { titulo: 'Los grados de libertad (Welch–Satterthwaite)', formula: `gl = (A + B)² / ( A²/(n₁−1) + B²/(n₂−1) ) = ${num(w.gl, 1)}\ncon A = s₁²/n₁ = ${num(p.termino_1, 4)} y B = s₂²/n₂ = ${num(p.termino_2, 4)}`, nota: 'Dice qué campana t usar. Con tantos gl es casi la normal.' },
    {
      titulo: 'La decisión',
      formula: `${w.critico.alto !== null && w.critico.bajo !== null ? `valores críticos = ±${num(w.critico.alto, 4)}` : `valor crítico = ${num((w.critico.alto ?? w.critico.bajo) as number, 4)}`}\n|t| = ${num(tAbs, 2)}  ${w.rechaza ? '>' : '≤'}  crítico   →   ${w.rechaza ? 'SE RECHAZA H₀' : 'NO se rechaza H₀'}\nvalor p = ${fmtP(w.p)}   ${w.p < w.alpha ? '<' : '≥'}   α = ${num(w.alpha, 2)}`,
      nota: `${w.rechaza ? 'Una diferencia así sería rarísima si H₀ fuera cierta.' : 'La diferencia es compatible con el azar.'} Tamaño del efecto: g de Hedges = ${num(w.efecto.valor, 2)} (${efectoTexto(w.efecto.valor)}). IC ${Math.round(w.ic_diferencia.nivel * 100)} % de la diferencia: ${num(w.ic_diferencia.bajo, 2)} a ${num(w.ic_diferencia.alto, 2)}.`,
    },
  ]

  return (
    <Panel title="3. La prueba t de Welch, paso a paso" note="Una t de Student para comparar dos medias sin suponer varianzas iguales: la misma del informe entregado.">
      <div ref={ref} className="flex flex-col gap-6">
        <ol className="order-2 grid gap-3 lg:grid-cols-2" aria-label="Pasos de la prueba">
          {filas.map((f, i) => (
            <li key={f.titulo} className="rounded-lg border p-3" aria-hidden={i > paso}
              style={{ borderColor: i === paso ? 'var(--serie-1)' : 'var(--rule)', opacity: i <= paso ? 1 : 0.22, transform: i <= paso ? 'none' : 'translateY(6px)', transition: 'opacity var(--t-slow) var(--ease), transform var(--t-slow) var(--ease), border-color var(--t) var(--ease)' }}>
              <p className="mb-1 flex items-center gap-2 font-semibold">
                <span className="grid h-6 w-6 place-items-center rounded-full text-[0.8125rem]" style={{ background: i <= paso ? 'var(--serie-1)' : 'var(--grid-strong)', color: 'var(--on-accent)' }}>{i + 1}</span>
                {f.titulo}
              </p>
              <pre className="math" style={{ padding: '8px 10px', fontSize: '0.8125rem', lineHeight: 1.6 }}>{f.formula}</pre>
              {f.nota && <p className="small mt-1">{f.nota}</p>}
            </li>
          ))}
        </ol>

        <div className="order-1 min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <button type="button" className="chip" onClick={reproducir}>Repetir paso a paso</button>
            <button type="button" className="chip" aria-pressed={alejar} onClick={() => setAlejar((v) => !v)}>
              {alejar ? 'Acercar al centro' : 'Alejar para ver dónde cae la t real'}
            </button>
            <Verified ok={w.verificacion.coincide} label={w.verificacion.coincide ? 'Igual que SciPy' : 'No coincide con SciPy'} methods={['fórmula a mano', 'scipy.stats.ttest_ind']} />
          </div>
          <Lienzo titulo="Campana t de Welch con la zona de rechazo y el valor observado"
            descripcion={`Campana t con ${num(w.gl, 0)} grados de libertad. El estadístico observado es ${num(w.t, 2)}${fueraDeVista ? ' y queda fuera de la parte visible, muy a la derecha' : ''}. Las zonas rayadas son la región de rechazo con α = ${num(w.alpha, 2)}.`}>
            <PatronRayas id="rayas-prueba" color="var(--bad)" />
            <EjeY Y={Y} marcasY={marcas(0, ymax, 4)} x={MARGEN.l} xFin={ANCHO - MARGEN.r} etiqueta="Densidad f(t)" formato={(v) => num(v, 2)} />
            <EjeX X={X} marcasX={marcas(-xm, xm, 10)} y={ALTO - MARGEN.b} etiqueta="Valor de t" formato={(v) => num(v, xm > 12 ? 0 : 1)} />
            {zonas.map(([x0, x1], i) => <path key={i} d={areaBajo(curva((u) => tPdf(u, w.gl), x0, x1, 200), x0, x1, X, Y)} fill="url(#rayas-prueba)" />)}
            <path d={ruta(pts, X, Y)} fill="none" stroke="var(--ink)" strokeWidth="3.2" strokeLinejoin="round" />
            {paso >= 3 && (
              <g>
                <line x1={X(xt)} x2={X(xt)} y1={Y(0)} y2={Y(ymax * 0.82)} stroke="var(--serie-2)" strokeWidth="3" />
                <circle cx={X(xt)} cy={Y(ymax * 0.82)} r="7" fill="var(--serie-2)" stroke="var(--paper)" strokeWidth="2" />
                <text x={X(xt) + (xt > 0 && xt > xm * 0.6 ? -12 : 12)} y={Y(ymax * 0.82) - 4} textAnchor={xt > 0 && xt > xm * 0.6 ? 'end' : 'start'} fontSize="15" fontWeight="700" fill="var(--serie-2)">
                  t = {num(w.t, 2)}{fueraDeVista ? '  →  más a la derecha' : ''}
                </text>
              </g>
            )}
            {paso >= 5 && w.critico.alto !== null && w.critico.alto < xm && (
              <text x={X(w.critico.alto)} y={Y(ymax * 0.55)} textAnchor="start" dx="8" fontSize="13" fontWeight="600" fill="var(--bad)">crítico {num(w.critico.alto, 3)}</text>
            )}
          </Lienzo>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ComoLeerla titulo="Cómo leer la campana de la prueba">
          <p>Es la campana que <i>tendría</i> t si H₀ fuera cierta (si en el fondo no hubiera diferencia). Casi todo el área está cerca de 0: lo normal es que t salga entre −2 y 2.</p>
          <p>Las <b>zonas rayadas</b> son la región de rechazo: si nuestra t cae ahí, un valor así sería tan raro (menos del {num(w.alpha * 100, 1)} %) que preferimos dudar de H₀. La <b>línea roja</b> es nuestra t real: {num(w.t, 2)}.</p>
          <p>Pulsa «Alejar»: el eje se estira hasta ±30 y la campana se vuelve una aguja en el centro, mientras la t real queda lejísimo a la derecha. Eso es lo que significa un valor p de {fmtP(w.p)}.</p>
        </ComoLeerla>
        <ComoLeerla titulo="Por qué Welch y no la t «clásica»">
          <p>La t clásica de Student supone que los dos grupos tienen la <b>misma varianza</b>. Aquí no es así (la razón entre varianzas es {num(w.student_clasica.razon_varianzas, 2)}). Welch no lo supone y ajusta los grados de libertad: es una t de Student más segura, y es la que se usó en el informe entregado.</p>
          <p>Para que veas que no cambia la conclusión: la t clásica da {num(w.student_clasica.t, 2)} (gl = {w.student_clasica.gl.toLocaleString('es-CO')}) y la de Welch {num(w.t, 2)}. Las dos están muy lejos del valor crítico.</p>
          <p><b>Ojo con lo que NO dice:</b> «significativo» no es «importante». Con {w.meta.filas.toLocaleString('es-CO')} archivos casi cualquier diferencia sale significativa; lo que importa es el tamaño del efecto (g = {num(w.efecto.valor, 2)}, {efectoTexto(w.efecto.valor)}) y que es una <b>asociación</b>, no una causa.</p>
        </ComoLeerla>
      </div>
    </Panel>
  )
}
