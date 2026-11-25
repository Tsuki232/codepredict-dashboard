import { ChevronDown, ChevronUp, Film, Pause, Play, Presentation, SkipBack, SkipForward, X } from 'lucide-react'
import { useState } from 'react'
import { palabras, ventana } from '../../motion/tiempo'
import { VELOCIDADES, useVersion } from './pelicula'
import type { EscenaDef, Pelicula } from './pelicula'

const mmss = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

/**
 * Controles del modo película, pegados abajo: reproducir/pausar, escena anterior y siguiente, barra de tiempo con una marca por escena,
 * velocidad y salir. Arranca en pausa (nada se reproduce solo) y los subtítulos se escriben al ritmo de la escena.
 */
export function BarraPelicula({ p, escenas, onPresentar }: { p: Pelicula; escenas: EscenaDef[]; onPresentar: () => void }) {
  useVersion(p)                                    // se redibuja en cada cuadro de la película
  const [plegada, setPlegada] = useState(() => typeof window !== 'undefined' && (window.innerHeight < 800 || window.innerWidth < 640))   // en pantallas bajas o angostas arranca sin la tira de escenas
  const pos = p.activo ? p.pos : null
  const actual = pos ? escenas[pos.i] : null
  const total = p.total
  const subtitulo = actual && pos ? palabras(actual.narracion, ventana(pos.k, 0.02, 0.62)) : ''
  const pct = total ? (p.t / total) * 100 : 0

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && p.activo) { e.preventDefault(); p.salir() }
  }

  return (
    <div className="pelicula" role="region" aria-label="Modo película del tablero" onKeyDown={teclas} data-plegada={plegada} data-activa={p.activo}>
      <p className="sr-only" role="status" aria-live="polite">{actual && pos ? `Escena ${pos.i + 1} de ${escenas.length}: ${actual.titulo}. ${actual.narracion}` : ''}</p>
      <div className="pelicula-subtitulo" aria-hidden>
        {actual && pos ? (
          <>
            <span className="pelicula-etiqueta">{pos.i + 1}/{escenas.length} · {actual.titulo}</span>
            <span>{subtitulo}</span>
          </>
        ) : (
          <span style={{ color: 'var(--ink-2)' }}><Film size={15} className="mr-2 inline align-[-2px]" aria-hidden />Modo película: pulsa ▶ para ver el tablero como un vídeo, con subtítulos.</span>
        )}
      </div>
      <div className="pelicula-controles">
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn-icon" onClick={p.anterior} aria-label="Escena anterior" title="Escena anterior"><SkipBack size={16} aria-hidden /></button>
          <button type="button" className="btn-icon pelicula-play" onClick={p.alternar} aria-label={p.enMarcha ? 'Pausar' : p.activo && p.t >= total ? 'Ver otra vez' : 'Reproducir'} title={p.enMarcha ? 'Pausar' : 'Reproducir'}>
            {p.enMarcha ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
          </button>
          <button type="button" className="btn-icon" onClick={p.siguiente} aria-label="Escena siguiente" title="Escena siguiente"><SkipForward size={16} aria-hidden /></button>
        </div>
        <div className="min-w-0 flex-1">
          <input type="range" className="slider" min={0} max={Math.max(1, total)} step={20} value={Math.round(p.t)}
            onChange={(e) => p.buscar(Number(e.target.value))} aria-label="Barra de tiempo del tablero"
            aria-valuetext={actual && pos ? `Escena ${pos.i + 1} de ${escenas.length}, ${actual.titulo}` : 'Sin reproducir'}
            style={{ ['--pct' as string]: `${pct}%`, ['--fill' as string]: 'var(--serie-1)' }} />
          <ol className="pelicula-marcas" aria-label="Escenas">
            {escenas.map((e, j) => (
              <li key={e.id} style={{ flexGrow: e.ms }}>
                <button type="button" className="pelicula-marca" data-activa={pos?.i === j} aria-label={`Ir a la escena ${j + 1}: ${e.titulo}`} title={`${j + 1}. ${e.titulo}`} onClick={() => p.ir(j)}>{j + 1}</button>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="small tabular-nums pelicula-extra" aria-hidden>{mmss(p.t)} / {mmss(total)}</span>
          <div className="flex gap-1 pelicula-extra" role="group" aria-label="Velocidad">
            {VELOCIDADES.map((v) => (
              <button key={v} type="button" className="chip" style={{ height: 28, minWidth: 40, padding: '0 8px', fontSize: '0.8125rem' }} aria-pressed={p.velocidad === v} onClick={() => p.fijarVelocidad(v)}>{String(v).replace('.', ',')}×</button>
            ))}
          </div>
          <button type="button" className="btn-icon" onClick={onPresentar} aria-label="Presentar a pantalla completa" title="Presentar a pantalla completa"><Presentation size={16} aria-hidden /></button>
          <button type="button" className="btn-icon" onClick={() => setPlegada((v) => !v)} aria-expanded={!plegada} aria-label={plegada ? 'Mostrar la tira de escenas' : 'Ocultar la tira de escenas'} title={plegada ? 'Mostrar escenas' : 'Ocultar escenas'}>
            {plegada ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          </button>
          {p.activo && <button type="button" className="btn-icon" onClick={p.salir} aria-label="Salir del modo película" title="Salir (Esc)"><X size={16} aria-hidden /></button>}
        </div>
      </div>
    </div>
  )
}
