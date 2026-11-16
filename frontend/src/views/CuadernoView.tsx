import { ChevronDown, Loader, Play, RotateCcw, Square } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { StepDetails } from '../features/charts/Funnel'
import { engineName } from '../lib/engine'
import { fmt, fmtInt } from '../lib/format'
import { useStore } from '../state/store'
import type { NbBlock, NbCell, NbResult } from '../state/types'
import { Panel } from '../ui/Panel'
import { Verified } from '../ui/Verified'

const KEYWORDS = new Set(['def', 'return', 'if', 'else', 'elif', 'for', 'in', 'not', 'and', 'or', 'import', 'from', 'with', 'try', 'finally', 'lambda',
  'None', 'True', 'False', 'as', 'is', 'raise', 'while', 'class'])
const TOKEN = /(#[^\n]*)|("""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/g

/** Coloreado mínimo de Python (comentarios, textos, números y palabras reservadas). Es solo presentación. */
function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of code.matchAll(TOKEN)) {
    const at = m.index ?? 0
    if (at > last) out.push(code.slice(last, at))
    const [tok, comment, str, num, word] = m
    if (comment) out.push(<span key={i++} className="tok-c">{tok}</span>)
    else if (str) out.push(<span key={i++} className="tok-s">{tok}</span>)
    else if (num) out.push(<span key={i++} className="tok-n">{tok}</span>)
    else if (word && KEYWORDS.has(word)) out.push(<span key={i++} className="tok-k">{tok}</span>)
    else out.push(tok)
    last = at + tok.length
  }
  if (last < code.length) out.push(code.slice(last))
  return out
}

function Blocks({ blocks }: { blocks: NbBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'text') return <pre key={i} className="out">{b.text}</pre>
        if (b.type === 'table') {
          return (
            <div key={i} className="mt-3 overflow-x-auto">
              {b.title && <p className="small mb-1">{b.title}</p>}
              <table className="data-table">
                <thead><tr>{b.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((v, k) => <td key={k}>{typeof v === 'number' ? (Number.isInteger(v) ? fmtInt(v) : String(v).replace('.', ',')) : v}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )
        }
        const s = b.step
        const keep = s.before ? (s.after / s.before) * 100 : 0
        return (
          <div key={i} className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--rule)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.9375rem] font-semibold">{s.label}</span>
              <Verified ok={s.verified} label={s.verified ? 'pandas = DuckDB' : 'No coincide'} methods={s.methods} />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="relative h-[10px] flex-1 overflow-hidden rounded-full" style={{ background: 'var(--grid)' }} aria-hidden>
                <span className="absolute inset-y-0 left-0" style={{ width: `${keep}%`, background: 'var(--serie-1)' }} />
                {s.removed > 0 && <span className="absolute inset-y-0" style={{ left: `${keep}%`, width: `${Math.max(100 - keep, 0.6)}%`, background: 'var(--serie-2)' }} />}
              </span>
              <span className="shrink-0 text-[0.875rem] font-semibold tabular-nums">
                {fmtInt(s.before)} → {fmtInt(s.after)}{s.removed > 0 && <span style={{ color: 'var(--serie-2)' }}> (−{fmtInt(s.removed)})</span>}
              </span>
            </div>
            <details className="mt-2">
              <summary className="small cursor-pointer">Ver conteos y cómo se comprobó</summary>
              <div className="mt-2"><StepDetails step={s} /></div>
            </details>
          </div>
        )
      })}
    </>
  )
}

function Cell({ cell, result, stale, blocked }: { cell: NbCell; result?: NbResult; stale: boolean; blocked: string | null }) {
  const run = useStore((s) => s.runCell)
  const running = useStore((s) => s.nbRunning)
  const busy = useStore((s) => s.nbRunning !== null || s.nbRunAll)
  const error = useStore((s) => s.nbError)
  const [open, setOpen] = useState(true)
  const isRunning = running === cell.id
  const code = useMemo(() => highlight(cell.code), [cell.code])
  return (
    <section className="nb-cell" data-stale={stale} aria-label={cell.title}>
      <div className="nb-gutter">
        <button type="button" className="nb-play" data-state={result && !stale ? 'done' : 'idle'} disabled={busy || !!blocked}
          title={blocked ?? (result ? 'Ejecutar de nuevo esta celda' : 'Ejecutar esta celda')} aria-label={`Ejecutar «${cell.title}»`} onClick={() => void run(cell.id)}>
          {isRunning ? <Loader size={18} className="nb-spin" aria-hidden /> : <Play size={18} aria-hidden />}
        </button>
        <span className="nb-count" aria-label={result ? `ejecución ${result.execution_count}` : 'sin ejecutar'}>[{result ? result.execution_count : ' '}]</span>
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[1rem] font-semibold">{cell.title}</h3>
            <p className="small max-w-[70ch]">{cell.about}</p>
          </div>
          <div className="flex items-center gap-2">
            {stale && <span className="small font-semibold" style={{ color: 'var(--warn)' }}>desactualizada: vuelve a ejecutarla</span>}
            {result && !stale && <span className="small">{fmt(result.seconds, 2)} s</span>}
            <button type="button" className="btn-icon" style={{ width: 30, height: 30 }} aria-expanded={open} aria-label={open ? 'Ocultar el código' : 'Mostrar el código'} onClick={() => setOpen(!open)}>
              <ChevronDown size={15} aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform var(--t) var(--ease)' }} />
            </button>
          </div>
        </div>
        {open && <pre className="code" tabIndex={0} aria-label={`Código de «${cell.title}»`}>{code}</pre>}
        {isRunning && <p className="small mt-3 flex items-center gap-2" role="status"><Loader size={14} className="nb-spin" aria-hidden /> Ejecutando…</p>}
        {result && <Blocks blocks={result.blocks} />}
        {error && error.cell === cell.id && <p className="mt-3 text-[0.875rem]" style={{ color: 'var(--bad)' }} role="alert">⚠ {error.message}</p>}
      </div>
    </section>
  )
}

export function CuadernoView() {
  const cells = useStore((s) => s.nbCells)
  const results = useStore((s) => s.nbResults)
  const stale = useStore((s) => s.nbStale)
  const load = useStore((s) => s.loadNotebook)
  const runAll = useStore((s) => s.runAllCells)
  const stop = useStore((s) => s.stopRunAll)
  const reset = useStore((s) => s.resetNotebook)
  const runAllBusy = useStore((s) => s.nbRunAll)
  const anyBusy = useStore((s) => s.nbRunning !== null)
  const rules = useStore((s) => s.rules)
  const rulesKey = useStore((s) => s.nbRulesKey)
  const ada = useStore((s) => s.health?.ada)
  const err = useStore((s) => s.nbError)
  const alpha = useStore((s) => s.alpha)
  useEffect(() => { void load() }, [load])

  if (!cells) return err ? <Panel title="No se pudo cargar el cuaderno" note={err.message}><p className="small">Revisa el servidor.</p></Panel> : <p className="label py-24 text-center" role="status">Preparando el cuaderno…</p>

  const done = cells.filter((c) => results[c.id]).length
  const rulesChanged = rulesKey !== null && rulesKey !== JSON.stringify(rules)
  const POLICY: Record<string, string> = { keep_first: 'dejar la primera ruta', drop_all: 'quitar rutas repetidas', keep_all: 'conservar rutas repetidas', keep: 'conservar atípicos', tukey3: 'quitar atípicos Q3+3·RIC', p999: 'quitar atípicos > p99,9' }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="lead max-w-[40ch]" aria-live="polite">
        {done === 0 ? 'Limpiar desde cero y ver cada paso ejecutarse.' : done === cells.length ? 'Todo el cuaderno se ejecutó: limpieza, guardado e inferencia.' : `${done} de ${cells.length} celdas ejecutadas.`}
      </h2>

      <Panel title="Cómo funciona" note="Cada celda ejecuta código real del proyecto y muestra ese mismo código. No hay retardos de adorno: cada tiempo es el que tardó de verdad.">
        <div className="flex flex-wrap items-center gap-3">
          {runAllBusy
            ? <button type="button" className="chip" style={{ height: 40, paddingInline: 18 }} onClick={stop}><Square size={15} aria-hidden className="mr-2" /> Detener</button>
            : <button type="button" className="chip" disabled={anyBusy} style={{ height: 40, paddingInline: 18, background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' }} onClick={() => void runAll()}>
              <Play size={15} aria-hidden className="mr-2" /> Ejecutar todo desde cero
            </button>}
          <button type="button" className="chip" disabled={anyBusy || runAllBusy} style={{ height: 40, paddingInline: 18 }} onClick={() => void reset()}>
            <RotateCcw size={15} aria-hidden className="mr-2" /> Reiniciar (todo en blanco)
          </button>
          <span className="small">{!ada ? '' : ada.ready ? `${engineName(ada)} lista para las celdas de inferencia.` : ada.phase === 'error' ? `Ada no disponible: ${ada.error}` : 'Ada se está cargando (las celdas de inferencia esperan).'}</span>
        </div>
        <p className="small mt-3">
          Reglas activas (se eligen en «Limpieza visual»): {rules.integrity ? 'integridad' : 'sin integridad'} · {rules.drop_exact_duplicates ? 'quitar duplicados' : 'conservar duplicados'} · {POLICY[rules.path_policy]} · {POLICY[rules.outlier_policy]} · α = {String(alpha).replace('.', ',')}
        </p>
        {rulesChanged && <p className="small mt-2 font-semibold" style={{ color: 'var(--warn)' }} role="status">Cambiaste las reglas después de ejecutar: pulsa «Ejecutar todo desde cero» para ver el efecto.</p>}
        <p className="small mt-2">Las celdas se ejecutan en orden. Si reejecutas una, las siguientes quedan «desactualizadas», como en Colab. «Guardar» escribe el CSV limpio en la carpeta de trabajo (nunca en <code>data/raw</code>).</p>
      </Panel>

      <div className="panel" style={{ paddingTop: 8, paddingBottom: 8 }}>
        {cells.map((c, i) => {
          const prev = i > 0 ? cells[i - 1] : null
          const blocked = prev && !results[prev.id] ? `Ejecuta antes «${prev.title}»` : c.needs_ada && !ada?.ready ? 'Ada todavía no está lista' : null
          return <Fragment key={c.id}><Cell cell={c} result={results[c.id]} stale={stale.includes(c.id)} blocked={blocked} /></Fragment>
        })}
      </div>
    </div>
  )
}
