import { Pause, Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { curva, normalPdf, tCdf, tPdf, tQuantile } from '../../lib/tdist'
import { Panel } from '../../ui/Panel'
import { useSuave } from './animacion'
import { ALTO, ANCHO, ComoLeerla, EjeX, EjeY, Lienzo, MARGEN, PatronRayas, areaBajo, escala, marcas, num, ruta } from './lienzo'

const DOM: [number, number] = [-6, 6]
const RAPIDOS = [1, 2, 5, 10, 30]

/** 1. La campana de la t: una curva CONTINUA. Se puede cambiar los grados de libertad (con animación) y mover x para ver que la probabilidad es un área. */
export function SeccionCampana({ glDatos, alpha }: { glDatos: number; alpha: number }) {
  const [nu, setNu] = useState(5)
  const [x, setX] = useState(1.2)
  const [reproduciendo, setReproduciendo] = useState(false)
  const v = useSuave(nu, 450)

  useEffect(() => {
    if (!reproduciendo) return
    const id = setInterval(() => setNu((n) => { if (n >= 40) { setReproduciendo(false); return n } return n + 1 }), 130)
    return () => clearInterval(id)
  }, [reproduciendo])

  const X = escala(DOM, [MARGEN.l, ANCHO - MARGEN.r])
  const Y = escala([0, 0.45], [ALTO - MARGEN.b, MARGEN.t])
  const f = (u: number) => tPdf(u, v)
  const t = useMemo(() => curva(f, DOM[0], DOM[1], 320), [v])         // eslint-disable-line react-hooks/exhaustive-deps
  const normal = useMemo(() => curva(normalPdf, DOM[0], DOM[1], 200), [])
  const c = tQuantile(1 - alpha / 2, v)
  const izq = tCdf(x, v)

  const alClic = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const vista = ((e.clientX - r.left) / r.width) * (ANCHO - MARGEN.l - MARGEN.r)
    setX(Math.max(DOM[0], Math.min(DOM[1], DOM[0] + (vista / (ANCHO - MARGEN.l - MARGEN.r)) * (DOM[1] - DOM[0]))))
  }

  return (
    <Panel title="1. La campana de la t de Student" note="Una distribución continua: su gráfica es una curva y las probabilidades son áreas bajo ella.">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-3 text-sm" htmlFor="gl-slider">
          <span className="font-semibold">Grados de libertad (gl)</span>
          <input id="gl-slider" type="range" min={1} max={60} step={1} value={Math.min(nu, 60)} onChange={(e) => { setReproduciendo(false); setNu(Number(e.target.value)) }}
            className="w-52 accent-[var(--serie-1)]" aria-valuetext={`${nu} grados de libertad`} />
          <span className="chip" style={{ minWidth: 48, justifyContent: 'center' }}>{nu}</span>
        </label>
        {RAPIDOS.map((g) => (
          <button key={g} type="button" className="chip" aria-pressed={nu === g} onClick={() => { setReproduciendo(false); setNu(g) }}>{g}</button>
        ))}
        <button type="button" className="chip" aria-pressed={nu === glDatos} onClick={() => { setReproduciendo(false); setNu(glDatos) }}>{Math.round(glDatos).toLocaleString('es-CO')} (los de tus datos)</button>
        <button type="button" className="chip" style={{ gap: 6 }} onClick={() => { if (reproduciendo) setReproduciendo(false); else { setNu(1); setReproduciendo(true) } }}>
          {reproduciendo ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />} {reproduciendo ? 'Detener' : 'Animar de 1 a 40'}
        </button>
      </div>

      <Lienzo titulo="Densidad de la distribución t de Student" descripcion={`Campana con ${num(nu, 0)} grados de libertad comparada con la normal estándar. Las colas rayadas suman un área de ${num(alpha * 100, 1)} %, a partir de ±${num(c, 3)}.`}>
        <PatronRayas id="rayas-campana" color="var(--bad)" />
        <EjeY Y={Y} marcasY={marcas(0, 0.4, 4)} x={MARGEN.l} xFin={ANCHO - MARGEN.r} etiqueta="Densidad f(t)" />
        <EjeX X={X} marcasX={marcas(DOM[0], DOM[1], 12)} y={ALTO - MARGEN.b} etiqueta="Valor de t" formato={(u) => num(u, 0)} />
        {/* área a la izquierda de x: la probabilidad acumulada */}
        <path d={areaBajo(curva(f, DOM[0], x, 200), DOM[0], x, X, Y)} fill="var(--serie-1)" fillOpacity="0.2" />
        {/* zonas de rechazo (las dos colas) */}
        <path d={areaBajo(curva(f, DOM[0], -c, 120), DOM[0], -c, X, Y)} fill="url(#rayas-campana)" />
        <path d={areaBajo(curva(f, c, DOM[1], 120), c, DOM[1], X, Y)} fill="url(#rayas-campana)" />
        <path d={ruta(normal, X, Y)} fill="none" stroke="var(--serie-3)" strokeWidth="2" strokeDasharray="6 6" opacity="0.75" />
        <path d={ruta(t, X, Y)} fill="none" stroke="var(--ink)" strokeWidth="3.4" strokeLinejoin="round" />
        {[-c, c].map((u) => (
          <g key={u}>
            <line x1={X(u)} x2={X(u)} y1={Y(0)} y2={Y(0.43)} stroke="var(--bad)" strokeWidth="1.6" strokeDasharray="3 4" />
            <text x={X(u)} y={Y(0.43) - 6} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--bad)">{u < 0 ? '−' : '+'}{num(c, 3)}</text>
          </g>
        ))}
        <line x1={X(x)} x2={X(x)} y1={Y(0)} y2={Y(f(x))} stroke="var(--serie-1)" strokeWidth="2.4" />
        <circle cx={X(x)} cy={Y(f(x))} r="6" fill="var(--serie-1)" stroke="var(--paper)" strokeWidth="2" />
        <rect x={MARGEN.l} y={MARGEN.t} width={ANCHO - MARGEN.l - MARGEN.r} height={ALTO - MARGEN.t - MARGEN.b} fill="transparent" style={{ cursor: 'crosshair' }} onClick={alClic}>
          <title>Haz clic para mover x</title>
        </rect>
        <g fontSize="13">
          <line x1={MARGEN.l + 14} x2={MARGEN.l + 44} y1={MARGEN.t + 12} y2={MARGEN.t + 12} stroke="var(--ink)" strokeWidth="3.4" />
          <text x={MARGEN.l + 52} y={MARGEN.t + 16} fill="var(--ink-2)">t de Student con {num(v, 1)} gl</text>
          <line x1={MARGEN.l + 14} x2={MARGEN.l + 44} y1={MARGEN.t + 34} y2={MARGEN.t + 34} stroke="var(--serie-3)" strokeWidth="2" strokeDasharray="6 6" />
          <text x={MARGEN.l + 52} y={MARGEN.t + 38} fill="var(--ink-2)">normal estándar (la t con gl → ∞)</text>
        </g>
      </Lienzo>

      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <label className="flex flex-col gap-1" htmlFor="x-slider">
          <span className="label">Mueve el punto x (o haz clic en la gráfica)</span>
          <input id="x-slider" type="range" min={DOM[0]} max={DOM[1]} step={0.05} value={x} onChange={(e) => setX(Number(e.target.value))} className="accent-[var(--serie-1)]" />
        </label>
        <p><span className="label block">Área a la izquierda de x = {num(x, 2)}</span><b className="num">P(T ≤ {num(x, 2)}) = {num(izq * 100, 3)} %</b></p>
        <p><span className="label block">¿Y la probabilidad de justo ese valor?</span><b className="num">P(T = {num(x, 2)}) = 0</b> <span className="small">(un punto no tiene área)</span></p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ComoLeerla titulo="¿Es continua? Sí: por eso es una campana">
          <p><b>Continua</b> quiere decir que t puede valer <i>cualquier</i> número, no solo valores sueltos como 1, 2 o 3 (eso sería una distribución discreta, como la binomial, y se dibujaría con barras separadas). Por eso se dibuja con una curva suave.</p>
          <p>La altura de la curva se llama <b>densidad</b>. No es una probabilidad: una probabilidad es un <b>área</b> bajo la curva. El área total vale exactamente 1 (100 %), y el área sombreada de azul es P(T ≤ x).</p>
          <p>Como un solo punto no tiene ancho, no encierra área: <b>P(T = x) = 0</b>. Solo tiene sentido preguntar por intervalos: «entre −1 y 2», «más de 2,5», etc.</p>
        </ComoLeerla>
        <ComoLeerla titulo="¿Por qué la t y no la normal? Las colas">
          <p>La t es simétrica y está centrada en 0, como la normal, pero con <b>pocos grados de libertad (gl) tiene las colas más pesadas</b>: más probabilidad lejos del centro. Pasa porque no conocemos la desviación real σ y la estimamos con la de la muestra, y con pocos datos esa estimación es poco fiable.</p>
          <p>Los <b>grados de libertad</b> son, a grandes rasgos, cuánta información independiente hay (n − 1 para una media). Mueve el deslizador: con 1 gl las colas son enormes y con 30 o más la t casi se confunde con la normal (línea punteada).</p>
          <p>Las <b>zonas rayadas</b> son la región de rechazo: dejan el {num(alpha * 100, 1)} % del área repartido en las dos colas, a partir de ±{num(c, 3)}. Con 1 gl hay que irse hasta ±12,7; con los {Math.round(glDatos).toLocaleString('es-CO')} gl de tus datos basta con ±1,96.</p>
        </ComoLeerla>
      </div>
    </Panel>
  )
}
