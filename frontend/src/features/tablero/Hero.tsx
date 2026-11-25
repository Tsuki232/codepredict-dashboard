import { Play, Presentation, RotateCcw } from 'lucide-react'
import { memo, useContext } from 'react'
import { fmt, fmtInt, fmtP, fmtPct } from '../../lib/format'
import { escalon, expoOut, ventana } from '../../motion/tiempo'
import type { TNeurona, TWelch } from '../tstudent/tipos'
import { SufijoIdContext, useK } from './marco'
import { useEscenaActiva } from './pelicula'
import type { Pelicula } from './pelicula'
import { DUR } from './svg'
import type { TTablero } from './tipos'

const PREGUNTA = '¿Los archivos de software con errores son más complejos que los demás?'
const PALABRAS = PREGUNTA.split(' ')
const textoP = (p: number) => (p === 0 ? 'p < 10⁻³⁰⁰' : `p = ${fmtP(p)}`)

export interface Cifra { et: string; corta: string; v: number; f: (x: number) => string; sub: string }

/** Las cinco cifras que resumen el proyecto: sirven para la cabecera grande y para la franja que queda fija al bajar. */
export function cifrasDe(tab: TTablero, w: TWelch | null, neu: TNeurona | null): Cifra[] {
  const kp = tab.kpis
  return [
    { et: 'Archivos analizados', corta: 'Archivos', v: kp.filas, f: fmtInt, sub: `de ${fmtInt(tab.meta.filas_originales)} del archivo original` },
    { et: 'Con al menos un bug', corta: 'Con bug', v: kp.tasa_bug, f: (x) => fmtPct(x), sub: `${fmtInt(kp.con_bug)} archivos` },
    { et: 'Complejidad media (McCC) con bug', corta: 'McCC con bug', v: tab.cajas.con_bug.media, f: (x) => fmt(x, 1), sub: `sin bug: ${fmt(tab.cajas.sin_bug.media, 1)}` },
    { et: 't de Welch', corta: 't de Welch', v: w?.t ?? NaN, f: (x) => fmt(x, 1), sub: w ? textoP(w.p) : 'sin calcular' },
    { et: 'AUC de una neurona', corta: 'AUC', v: neu?.auc_prueba ?? NaN, f: (x) => fmt(x, 2), sub: 'en archivos que no vio al entrenar' },
  ]
}

/**
 * La cabecera del tablero (y primera escena de la película): la pregunta del proyecto, dos botones y las cinco cifras que la contestan.
 * Con el modo película la pregunta se escribe palabra por palabra y las cifras cuentan hasta su valor.
 */
export const Portada = memo(function Portada({ p, i, tab, w, neu, onPelicula, onPresentar }: {
  p: Pelicula; i: number; tab: TTablero; w: TWelch | null; neu: TNeurona | null; onPelicula: () => void; onPresentar: () => void
}) {
  const { k, ref, repetir } = useK(p, i, DUR.portada)
  const activa = useEscenaActiva(p)
  const sufijo = useContext(SufijoIdContext)
  const estado = activa < 0 ? 'libre' : activa === i ? 'activa' : 'otra'
  const cifras = cifrasDe(tab, w, neu)
  const visibles = Math.ceil(ventana(k, 0.02, 0.32) * PALABRAS.length)
  const trozo = (a: number, b: number) => PALABRAS.slice(a, b).filter((_, j) => a + j < visibles).join(' ')
  const kRaya = ventana(k, 0.3, 0.5)
  return (
    <div ref={ref} id={`escena-portada${sufijo}`} className="escena hero" data-estado={estado}>
      <p className="hero-kicker" style={{ opacity: expoOut(ventana(k, 0, 0.12)) }}>Estadística Inferencial y Ciencia de Datos · Unified Bug Dataset v1.2</p>
      <h2 className="hero-titulo" aria-label={PREGUNTA}>
        {trozo(0, 7)}{visibles > 7 && ' '}
        <span className="hero-resalta" style={{ ['--k' as string]: kRaya }}>{trozo(7, 9)}</span>{visibles > 9 && ' '}
        {trozo(9, PALABRAS.length)}
      </h2>
      <p className="hero-sub">Cifras calculadas en este equipo con Python sobre {fmtInt(tab.kpis.filas)} archivos Java, con su comprobación por una segunda vía. Más abajo, la comparación del código de personas con el de IA.</p>
      <div className="hero-acciones">
        <button type="button" className="btn-hero btn-hero-primario" onClick={onPelicula}><Play size={17} aria-hidden /> Ver como película</button>
        <button type="button" className="btn-hero" onClick={onPresentar}><Presentation size={17} aria-hidden /> Presentar</button>
        <button type="button" className="btn-hero btn-hero-ligero" onClick={repetir} aria-label="Repetir la animación de la cabecera"><RotateCcw size={15} aria-hidden /> Repetir</button>
      </div>
      <dl className="hero-cifras">
        {cifras.map((t, j) => {
          const e = expoOut(escalon(k, j, cifras.length, 0.35, 0.28, 0.85))
          return (
            <div key={t.et} className="hero-cifra" style={{ opacity: e, transform: `translateY(${(1 - e) * 14}px)` }}>
              <dt className="label">{t.et}</dt>
              <dd className="hero-num">{Number.isFinite(t.v) ? t.f(t.v * e) : '—'}</dd>
              <p className="small">{t.sub}</p>
            </div>
          )
        })}
      </dl>
      <details className="escena-datos">
        <summary>Ver las cifras de la cabecera como tabla</summary>
        <table className="data-table">
          <thead><tr><th scope="col">Cifra</th><th scope="col">Valor</th></tr></thead>
          <tbody>{cifras.map((t) => <tr key={t.et}><td>{t.et}</td><td>{Number.isFinite(t.v) ? t.f(t.v) : '—'}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  )
})

/** Las mismas cifras en una franja que queda pegada bajo la barra superior cuando la cabecera ya salió de pantalla. */
export function FranjaCifras({ cifras, visible, onPelicula, onPresentar }: { cifras: Cifra[]; visible: boolean; onPelicula: () => void; onPresentar: () => void }) {
  return (
    <div className="franja-cero">
      <div className="franja" data-visible={visible} role="region" aria-label="Cifras principales del proyecto" aria-hidden={!visible}>
        <dl className="franja-cifras">
          {cifras.map((c) => (
            <div key={c.et}><dt>{c.corta}</dt><dd>{Number.isFinite(c.v) ? c.f(c.v) : '—'}</dd></div>
          ))}
        </dl>
        <div className="flex shrink-0 gap-1.5">
          <button type="button" className="btn-icon" onClick={onPelicula} tabIndex={visible ? 0 : -1} aria-label="Ver como película" title="Ver como película"><Play size={16} aria-hidden /></button>
          <button type="button" className="btn-icon" onClick={onPresentar} tabIndex={visible ? 0 : -1} aria-label="Presentar a pantalla completa" title="Presentar"><Presentation size={16} aria-hidden /></button>
        </div>
      </div>
    </div>
  )
}
