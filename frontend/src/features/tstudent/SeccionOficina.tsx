import { Loader, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { api } from '../../lib/api'
import { Panel } from '../../ui/Panel'
import { num } from './lienzo'
import type { TNeurona } from './tipos'

const MCCC_MAX = 300
const LINEAS = 16
const VISTA = { rx: -16, ry: -24 }
const sigmoide = (z: number) => 1 / (1 + Math.exp(-z))
const delSlider = (v: number) => Math.max(1, Math.round(Math.pow(MCCC_MAX, v / 100)))       // escala logarítmica: 1 … 300
const alSlider = (m: number) => (Math.log(m) / Math.log(MCCC_MAX)) * 100
const PRESETS: [string, number][] = [['Función simple', 1], ['Normal', 8], ['Compleja', 40], ['Enorme', 200]]

/** Caja 3D hecha con seis caras de CSS, centrada en (x, y, z) del mundo. `frente` es lo que se dibuja sobre su cara frontal. */
function Caja({ x, y, z, w, h, d, color, ry = 0, frente, redondeo = 3 }: { x: number; y: number; z: number; w: number; h: number; d: number; color: string; ry?: number; frente?: ReactNode; redondeo?: number }) {
  const estilo = { width: w, height: h, transform: `translate3d(${x - w / 2}px, ${y - h / 2}px, ${z}px) rotateY(${ry}deg)`, '--c': color, '--r': `${redondeo}px` } as CSSProperties
  return (
    <div className="of-caja" style={estilo} aria-hidden>
      <div className="of-cara" data-lado="frente" style={{ width: w, height: h, transform: `translateZ(${d / 2}px)` }}>{frente}</div>
      <div className="of-cara" data-lado="atras" style={{ width: w, height: h, transform: `rotateY(180deg) translateZ(${d / 2}px)` }} />
      <div className="of-cara" data-lado="derecha" style={{ width: d, height: h, left: (w - d) / 2, transform: `rotateY(90deg) translateZ(${w / 2}px)` }} />
      <div className="of-cara" data-lado="izquierda" style={{ width: d, height: h, left: (w - d) / 2, transform: `rotateY(-90deg) translateZ(${w / 2}px)` }} />
      <div className="of-cara" data-lado="arriba" style={{ width: w, height: d, top: (h - d) / 2, transform: `rotateX(90deg) translateZ(${h / 2}px)` }} />
      <div className="of-cara" data-lado="abajo" style={{ width: w, height: d, top: (h - d) / 2, transform: `rotateX(-90deg) translateZ(${h / 2}px)` }} />
    </div>
  )
}

/** Las líneas de código de la pantalla: siempre las mismas (deterministas); las que llevan error se marcan en rojo. */
function Pantalla({ errores }: { errores: number }) {
  const malas = useMemo(() => new Set(Array.from({ length: errores }, (_, k) => Math.floor(((k + 0.5) * LINEAS) / Math.max(errores, 1)))), [errores])
  const lineas = useMemo(() => Array.from({ length: LINEAS }, (_, i) => {
    const sangria = [0, 1, 1, 2, 2, 2, 1, 2, 3, 3, 2, 1, 2, 2, 1, 0][i]
    const trozos = Array.from({ length: 2 + (i % 3) }, (_, j) => ({ ancho: 14 + ((i * 37 + j * 23) % 34), tipo: ['k', 'n', 's', 'f'][(i + j) % 4] }))
    return { sangria, trozos }
  }), [])
  return (
    <div className="of-pantalla">
      {lineas.map((l, i) => (
        <div key={i} className="of-linea" data-mala={malas.has(i)}>
          <span className="of-num">{i + 1}</span>
          <span className="of-sangria" style={{ width: l.sangria * 12 }} />
          {l.trozos.map((t, j) => <span key={j} className="of-trozo" data-tipo={t.tipo} style={{ width: t.ancho }} />)}
          {malas.has(i) && <span className="of-x">✕</span>}
        </div>
      ))}
    </div>
  )
}

const AVISOS = [
  { t: 'NullPointerException', x: -150, y: -150, z: 26 }, { t: 'Test fallido', x: 110, y: -128, z: 52 }, { t: 'Bug #482', x: -80, y: -96, z: 78 },
  { t: 'Build roto', x: 150, y: -70, z: 34 }, { t: 'Revisión: 12 comentarios', x: -140, y: -52, z: 62 }, { t: 'Regresión', x: 60, y: -170, z: 90 },
]

/** Ejemplo: un programador en una empresa. Se mueve la complejidad de su código y la neurona (la entrenada con los datos reales) dice qué tan probable es que tenga un bug. */
export function SeccionOficina({ sha }: { sha: string }) {
  const [n, setN] = useState<TNeurona | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState(alSlider(8))
  const [vista, setVista] = useState(VISTA)
  const arrastre = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    let vivo = true
    setN(null); setError(null)
    api.neurona().then((d) => { if (vivo) setN(d) }).catch((e: Error) => { if (vivo) setError(e.message) })
    return () => { vivo = false }
  }, [sha])

  const mccc = delSlider(v)
  const p = n ? sigmoide((n.w * (Math.log1p(mccc) - n.media_log)) / n.sd_log + n.b) : 0
  const errores = Math.round(p * LINEAS)
  const avisos = Math.round(p * AVISOS.length)
  const estado = p < 0.2 ? ['Codificando con tranquilidad', 'ok'] : p < 0.45 ? ['Algunas alertas en pantalla', 'warn'] : p < 0.7 ? ['La pantalla se llena de errores', 'bad'] : ['Pantalla llena de errores', 'bad']
  const sobre = (e: PointerEvent) => { arrastre.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId) }
  const mover = (e: PointerEvent) => {
    const a = arrastre.current
    if (!a) return
    arrastre.current = { x: e.clientX, y: e.clientY }
    setVista((s) => ({ ry: s.ry + (e.clientX - a.x) * 0.4, rx: Math.max(-60, Math.min(10, s.rx + (e.clientY - a.y) * 0.3)) }))
  }
  const teclas = (e: KeyboardEvent) => {
    const paso = 6
    const d: Record<string, [number, number]> = { ArrowLeft: [0, -paso], ArrowRight: [0, paso], ArrowUp: [-paso, 0], ArrowDown: [paso, 0] }
    const m = d[e.key]
    if (!m) return
    e.preventDefault()
    setVista((s) => ({ rx: Math.max(-60, Math.min(10, s.rx + m[0])), ry: s.ry + m[1] }))
  }

  return (
    <Panel title="Ejemplo en la oficina: ¿para qué sirve esto?" note="Un programador de una empresa y su pantalla. Mueve la complejidad de su código y mira cuántos errores aparecen, según la neurona entrenada con tus datos.">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-3 text-sm" htmlFor="of-mccc">
          <span className="font-semibold">Complejidad (McCC)</span>
          <input id="of-mccc" type="range" min={0} max={100} step={1} value={v} disabled={!n} onChange={(e) => setV(Number(e.target.value))} className="w-56 accent-[var(--serie-1)]" aria-valuetext={`complejidad ${mccc}`} />
          <span className="chip num" style={{ minWidth: 52, justifyContent: 'center' }}>{mccc}</span>
        </label>
        {PRESETS.map(([t, m]) => <button key={t} type="button" className="chip" aria-pressed={mccc === m} disabled={!n} onClick={() => setV(alSlider(m))}>{t} ({m})</button>)}
        <button type="button" className="chip" style={{ gap: 6 }} onClick={() => setVista(VISTA)}><RotateCcw size={14} aria-hidden /> Restablecer vista</button>
      </div>

      <div className="of-escena" tabIndex={0} role="img" onPointerDown={sobre} onPointerMove={mover} onPointerUp={() => { arrastre.current = null }} onPointerCancel={() => { arrastre.current = null }} onKeyDown={teclas}
        aria-label={n ? `Escena 3D: un programador frente a su monitor. Con complejidad ${mccc} la neurona estima ${num(p * 100, 0)} % de probabilidad de bug y la pantalla muestra ${errores} líneas con error. Se gira con el mouse o con las flechas.` : 'Escena 3D cargando.'}>
        <div className="of-mundo" style={{ transform: `rotateX(${vista.rx}deg) rotateY(${vista.ry}deg)` }}>
          <Caja x={0} y={212} z={0} w={760} h={4} d={460} color="#e7e3d8" redondeo={0} />
          {/* escritorio */}
          <Caja x={0} y={90} z={0} w={560} h={14} d={300} color="#b98a5a" />
          {[[-262, -130], [262, -130], [-262, 130], [262, 130]].map(([x, z]) => <Caja key={`${x}${z}`} x={x} y={154} z={z} w={14} h={114} d={14} color="#8a6540" redondeo={0} />)}
          {/* monitor */}
          <Caja x={0} y={74} z={-70} w={110} h={6} d={64} color="#2b2f3a" />
          <Caja x={0} y={48} z={-70} w={18} h={52} d={14} color="#2b2f3a" />
          <Caja x={0} y={-72} z={-70} w={330} h={196} d={12} color="#20232d" redondeo={6} frente={<Pantalla errores={errores} />} />
          {/* teclado */}
          <Caja x={0} y={80} z={40} w={210} h={6} d={74} color="#d7d9de" />
          {/* programador, sentado a la izquierda y mirando al monitor */}
          <Caja x={-250} y={150} z={120} w={70} h={10} d={70} color="#3a3f4b" ry={-24} />
          <Caja x={-250} y={178} z={120} w={12} h={64} d={12} color="#3a3f4b" ry={-24} />
          <Caja x={-250} y={60} z={150} w={84} h={96} d={40} color="var(--serie-1)" ry={-24} redondeo={8} />
          <Caja x={-250} y={-18} z={150} w={50} h={52} d={50} color="#e2b48f" ry={-24} redondeo={14} />
          <Caja x={-250} y={-40} z={150} w={54} h={16} d={54} color="#2a2018" ry={-24} redondeo={10} />
          <Caja x={-196} y={72} z={110} w={20} h={20} d={70} color="var(--serie-1)" ry={-24} redondeo={8} />
          {/* avisos flotando delante de la pantalla: más errores, más avisos */}
          {AVISOS.map((a, i) => (
            <div key={a.t} className="of-aviso" data-visible={i < avisos} style={{ transform: `translate3d(${a.x - 55}px, ${a.y}px, ${a.z}px) rotateY(${-vista.ry}deg)` }} aria-hidden>
              <span>✕</span> {a.t}
            </div>
          ))}
        </div>
        {!n && <p className="of-carga small" role="status">{error ? `No se pudo cargar la neurona: ${error}` : <><Loader size={13} className="animate-spin" aria-hidden /> Entrenando la neurona…</>}</p>}
        <p className="of-pista small" aria-hidden>Arrastra para girar · flechas del teclado</p>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3" aria-live="polite">
        <p><span className="label block">Estado del programador</span><b style={{ color: `var(--${estado[1]})` }}>{estado[0]}</b></p>
        <p><span className="label block">Probabilidad de bug (la neurona)</span><b className="num">{num(p * 100, 0)} %</b> <span className="small">con complejidad {mccc}</span></p>
        <p><span className="label block">En una empresa con 100 archivos así</span><b className="num">≈ {Math.round(p * 100)}</b> <span className="small">tendrían un bug</span></p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="small flex flex-col gap-2 max-w-[70ch]">
          <p><b>¿Para qué le sirve a una empresa?</b> Para decidir <b>dónde mirar primero</b>. Un equipo no puede revisar a mano todo su código: con la complejidad de cada archivo (algo que una herramienta mide sola) se ordena la lista y se dedica la revisión, las pruebas y los programadores más expertos a los archivos de más riesgo.</p>
          <p>Aquí la neurona sale de los 32 509 archivos reales del proyecto: con complejidad baja la pantalla está casi tranquila y, al subirla, los errores y avisos aumentan.</p>
        </div>
        <div className="small flex flex-col gap-2 max-w-[70ch]">
          <p><b>Lo que NO dice.</b> Es una <b>asociación</b>, no una causa: el código complejo suele ser también más grande, y complicar un archivo no «fabrica» bugs por sí solo. Usa una sola variable (AUC {n ? num(n.auc_prueba, 2) : '…'}), así que sirve para <b>priorizar</b>, no para afirmar que un archivo concreto tiene o no tiene un error.</p>
          <p>La escena es una ilustración: el programador y los avisos no son datos, solo la probabilidad que dibuja sale de la neurona.</p>
        </div>
      </div>
    </Panel>
  )
}
