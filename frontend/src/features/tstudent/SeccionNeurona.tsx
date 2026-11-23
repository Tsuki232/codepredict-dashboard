import { Loader } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { Panel } from '../../ui/Panel'
import { Verified } from '../../ui/Verified'
import { useReproduccion } from './animacion'
import { ALTO, ANCHO, ComoLeerla, EjeX, EjeY, Lienzo, MARGEN, escala, marcas, num, ruta } from './lienzo'
import type { Pt } from './lienzo'
import type { TNeurona } from './tipos'

const MCCC_MAX = 300
const sigmoide = (z: number) => 1 / (1 + Math.exp(-z))

/** 5. Predicción: una sola neurona (regresión logística) que estima P(bug) a partir de la complejidad. Se muestra cómo aprende, época a época. */
export function SeccionNeurona({ sha }: { sha: string }) {
  const [n, setN] = useState<TNeurona | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState<number | null>(null)
  const [mccc, setMccc] = useState(25)
  const { k, reproducir, corriendo, ref } = useReproduccion(5200, false)

  useEffect(() => {
    let vivo = true
    setN(null); setError(null)
    api.neurona().then((d) => { if (vivo) { setN(d); reproducir() } }).catch((e: Error) => { if (vivo) setError(e.message) })
    return () => { vivo = false }
  }, [sha, reproducir])

  const X = escala([0, Math.log10(MCCC_MAX)], [MARGEN.l, ANCHO - MARGEN.r])
  const Y = escala([0, 1], [ALTO - MARGEN.b, MARGEN.t])
  const ult = n ? n.historia.length - 1 : 0
  const idx = n ? (manual ?? Math.min(ult, Math.floor(k * (ult + 1)))) : 0
  const h = n?.historia[idx]
  const pDe = (m: number, w: number, b: number) => (n ? sigmoide((w * (Math.log1p(m) - n.media_log)) / n.sd_log + b) : 0)
  const grilla = useMemo(() => Array.from({ length: 121 }, (_, i) => Math.pow(10, (Math.log10(MCCC_MAX) * i) / 120)), [])
  const trazo: Pt[] = n && h ? grilla.map((m) => [Math.log10(m), pDe(m, h.w, h.b)]) : []
  const nMax = n ? Math.max(...n.tramos.map((t) => t.n)) : 1

  // gráfica pequeña de la pérdida (el «error» que la neurona intenta bajar)
  const Xe = escala([0, n?.epocas ?? 1], [MARGEN.l, ANCHO - MARGEN.r])
  const pmax = n ? Math.max(...n.historia.map((e) => e.perdida)) : 1
  const pmin = n ? Math.min(...n.historia.map((e) => e.perdida)) : 0
  const Ye = escala([pmin - 0.005, pmax + 0.005], [180 - 34, 14])

  const pPrueba = n ? pDe(mccc, n.w, n.b) : 0

  return (
    <Panel title="5. Predicción con una neurona" note="Un algoritmo mínimo que aprende, de los datos, qué tan probable es que un archivo tenga bug según su complejidad.">
      <div ref={ref}>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <button type="button" className="chip" disabled={!n || corriendo} onClick={() => { setManual(null); reproducir() }}>Entrenar otra vez (animación)</button>
          <label className="flex items-center gap-2 text-sm" htmlFor="epoca">
            <span className="label">Época</span>
            <input id="epoca" type="range" min={0} max={ult} value={idx} disabled={!n} onChange={(e) => setManual(Number(e.target.value))} className="w-44 accent-[var(--serie-1)]" aria-valuetext={h ? `época ${h.epoca}` : ''} />
            <span className="chip num" style={{ minWidth: 56, justifyContent: 'center' }}>{h?.epoca ?? 0}</span>
          </label>
          <span className="small num" role="status">{error ? `No se pudo entrenar: ${error}` : !n ? <><Loader size={13} className="animate-spin" aria-hidden /> Entrenando la neurona en el servidor…</> : `Error (entropía cruzada): ${num(h?.perdida ?? 0, 4)}`}</span>
        </div>

        <Lienzo titulo="Probabilidad de bug según la complejidad" descripcion={n ? `Los círculos son la proporción real de archivos con bug en cada tramo de complejidad. La curva es lo que predice la neurona en la época ${h?.epoca}. Al terminar de aprender, ambas coinciden: la probabilidad sube de ${num(n.ejemplos[0].p * 100, 0)} % con complejidad 1 a ${num(n.ejemplos[n.ejemplos.length - 1].p * 100, 0)} % con complejidad 200.` : 'Cargando.'}>
          <EjeY Y={Y} marcasY={[0, 0.2, 0.4, 0.6, 0.8, 1]} x={MARGEN.l} xFin={ANCHO - MARGEN.r} etiqueta="Probabilidad de tener bug" formato={(v) => `${Math.round(v * 100)} %`} />
          <EjeX X={X} marcasX={[0, Math.log10(2), Math.log10(5), 1, Math.log10(20), Math.log10(50), 2, Math.log10(200)]} y={ALTO - MARGEN.b} etiqueta="Complejidad del archivo (McCC, escala logarítmica)" formato={(v) => String(Math.round(Math.pow(10, v)))} />
          {n && (
            <>
              <line x1={MARGEN.l} x2={ANCHO - MARGEN.r} y1={Y(n.tasa_base)} y2={Y(n.tasa_base)} stroke="var(--muted)" strokeWidth="1.6" strokeDasharray="2 6" />
              <text x={ANCHO - MARGEN.r - 6} y={Y(n.tasa_base) - 7} textAnchor="end" fontSize="12.5" fill="var(--ink-2)">{num(n.tasa_base * 100, 1)} % de todos los archivos tienen bug</text>
              {n.tramos.map((t) => {
                const m = Math.sqrt(Math.max(t.desde, 1) * Math.max(t.hasta, 1))
                return (
                  <circle key={t.desde} cx={X(Math.log10(Math.min(m, MCCC_MAX)))} cy={Y(t.observado)} r={6 + 13 * Math.sqrt(t.n / nMax)} fill="var(--serie-2)" fillOpacity="0.28" stroke="var(--serie-2)" strokeWidth="2">
                    <title>{`Archivos con complejidad de ${num(t.desde, 0)} a ${num(t.hasta, 0)} (${t.n.toLocaleString('es-CO')} archivos): ${num(t.observado * 100, 1)} % tienen bug; la neurona predice ${num(t.predicho * 100, 1)} %`}</title>
                  </circle>
                )
              })}
              <path d={ruta(trazo, X, Y)} fill="none" stroke="var(--serie-1)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <line x1={X(Math.log10(Math.max(mccc, 1)))} x2={X(Math.log10(Math.max(mccc, 1)))} y1={Y(0)} y2={Y(pPrueba)} stroke="var(--ink)" strokeWidth="1.6" strokeDasharray="4 4" />
              <circle cx={X(Math.log10(Math.max(mccc, 1)))} cy={Y(pPrueba)} r="7" fill="var(--ink)" stroke="var(--paper)" strokeWidth="2" />
            </>
          )}
          <g fontSize="13">
            <circle cx={MARGEN.l + 22} cy={MARGEN.t + 12} r="8" fill="var(--serie-2)" fillOpacity="0.28" stroke="var(--serie-2)" strokeWidth="2" />
            <text x={MARGEN.l + 38} y={MARGEN.t + 17} fill="var(--ink-2)">lo que pasó de verdad (tamaño = cuántos archivos)</text>
            <line x1={MARGEN.l + 12} x2={MARGEN.l + 34} y1={MARGEN.t + 38} y2={MARGEN.t + 38} stroke="var(--serie-1)" strokeWidth="4" strokeLinecap="round" />
            <text x={MARGEN.l + 38} y={MARGEN.t + 43} fill="var(--ink-2)">lo que predice la neurona</text>
          </g>
        </Lienzo>

        {n && (
          <Lienzo titulo="Error de la neurona durante el entrenamiento" descripcion={`El error baja de ${num(n.historia[0].perdida, 3)} a ${num(n.historia[ult].perdida, 3)} a medida que aprende.`} alto={190}>
            <EjeY Y={Ye} marcasY={marcas(pmin, pmax, 3)} x={MARGEN.l} xFin={ANCHO - MARGEN.r} etiqueta="Error" formato={(v) => num(v, 2)} />
            <EjeX X={Xe} marcasX={marcas(0, n.epocas, 6)} y={190 - 34} formato={(v) => num(v, 0)} etiqueta="Época (una época = una pasada por todos los archivos de entrenamiento)" />
            <path d={ruta(n.historia.map((e) => [e.epoca, e.perdida] as Pt), Xe, Ye)} fill="none" stroke="var(--ink-2)" strokeWidth="2.4" />
            {h && <circle cx={Xe(h.epoca)} cy={Ye(h.perdida)} r="6.5" fill="var(--serie-1)" stroke="var(--paper)" strokeWidth="2" />}
          </Lienzo>
        )}
      </div>

      {n && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm" htmlFor="prueba-mccc">
              <span className="label">Pruébala: un archivo con complejidad McCC = <b className="num">{mccc}</b></span>
              <input id="prueba-mccc" type="range" min={1} max={MCCC_MAX} value={mccc} onChange={(e) => setMccc(Number(e.target.value))} className="accent-[var(--serie-1)]" />
            </label>
            <p><span className="label block">Probabilidad de bug que estima</span><b className="num" style={{ fontSize: '1.4rem' }}>{num(pPrueba * 100, 1)} %</b> <span className="small">(promedio de todos: {num(n.tasa_base * 100, 1)} %)</span></p>
            <p className="flex flex-wrap items-center gap-2"><Verified ok={n.verificacion.coincide} label="Dos vías coinciden" methods={['descenso de gradiente', 'Newton–Raphson']} />
              <span className="small">w: {num(n.w, 4)} contra {num(n.verificacion.w_newton, 4)}</span></p>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="data-table" aria-label="Lo predicho contra lo observado por tramos de complejidad">
              <thead><tr><th scope="col">Complejidad (McCC)</th><th scope="col">Archivos</th><th scope="col">Con bug de verdad</th><th scope="col">Predicho por la neurona</th></tr></thead>
              <tbody>{n.tramos.map((t) => <tr key={t.desde}><td>{num(t.desde, 0)} a {num(t.hasta, 0)}</td><td>{t.n.toLocaleString('es-CO')}</td><td>{num(t.observado * 100, 1)} %</td><td>{num(t.predicho * 100, 1)} %</td></tr>)}</tbody>
            </table>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <ComoLeerla titulo="Qué es una neurona y cómo aprende">
              <p>Recibe un número, la complejidad, ya transformada con <b>log(1 + McCC)</b> (porque la complejidad es muy asimétrica) y estandarizada. Lo multiplica por un <b>peso</b> w, le suma un <b>sesgo</b> b y lo pasa por la <b>sigmoide</b>, que lo convierte en una probabilidad entre 0 y 1:</p>
              <pre className="math" style={{ padding: '8px 10px', fontSize: '0.8125rem' }}>{`P(bug) = 1 / (1 + e^−(w·z + b))\ncon z = (log(1+McCC) − ${num(n.media_log, 3)}) / ${num(n.sd_log, 3)}\nw = ${num(n.w, 4)}   b = ${num(n.b, 4)}`}</pre>
              <p><b>Aprender</b> es ajustar w y b para equivocarse menos. En cada época se mide el error con todos los archivos de entrenamiento ({n.n_entrenamiento.toLocaleString('es-CO')}, el 80 %) y se mueven w y b un pasito (tasa {n.tasa_aprendizaje}) en la dirección que más baja el error: es el <b>descenso de gradiente</b>. La curva azul se va acomodando a los círculos rojos.</p>
            </ComoLeerla>
            <ComoLeerla titulo="Qué tan bien funciona (sin exagerar)">
              <p>Se prueba con los {n.n_prueba.toLocaleString('es-CO')} archivos que la neurona <b>nunca vio</b> (el 20 %). El <b>AUC</b> es {num(n.auc_prueba, 3)}: si se toma un archivo con bug y otro sin bug al azar, el {num(n.auc_prueba * 100, 0)} % de las veces la neurona le da mayor probabilidad al que sí tiene bug (0,5 sería lanzar una moneda; 1, acertar siempre). En entrenamiento dio {num(n.auc_entrenamiento, 3)}: casi igual, así que no memorizó.</p>
              <p><b>Comprobación:</b> se entrenó una segunda vez con otro método (Newton–Raphson) y salió el mismo w y b, hasta {num(Math.max(n.verificacion.diferencia_w, n.verificacion.diferencia_b), 6)} de diferencia. Las pruebas automáticas la comparan además con scikit-learn.</p>
              <p><b>Límites:</b> usa una sola variable. Sirve para <b>priorizar qué revisar primero</b>, no para decidir que un archivo tiene o no un bug, y describe una asociación, no una causa.</p>
            </ComoLeerla>
          </div>
        </>
      )}
    </Panel>
  )
}
