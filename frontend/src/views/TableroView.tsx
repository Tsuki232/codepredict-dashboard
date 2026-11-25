import { useReducedMotion } from 'motion/react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BarraPelicula } from '../features/tablero/BarraPelicula'
import { Cierre, IaDetalle, IaTasas } from '../features/tablero/EscenasIa'
import type { Leng } from '../features/tablero/EscenasIa'
import { Distribucion, Embudo, Probabilidad, Riesgo } from '../features/tablero/EscenasDatos'
import { Neurona, Permutacion, Welch } from '../features/tablero/EscenasInferencia'
import { FranjaCifras, Portada, cifrasDe } from '../features/tablero/Hero'
import { Presentacion } from '../features/tablero/Presentacion'
import { construirEscenas } from '../features/tablero/escenas'
import type { EscenaId } from '../features/tablero/escenas'
import { useEscenaActiva, usePelicula } from '../features/tablero/pelicula'
import type { EscenaDef } from '../features/tablero/pelicula'
import type { IaFuenteId, TIa, TTablero } from '../features/tablero/tipos'
import type { TNeurona, TPermutacion, TWelch } from '../features/tstudent/tipos'
import { ApiError, api } from '../lib/api'
import { Escalonado } from '../motion/Escalonado'
import { useStore } from '../state/store'
import { EsqueletoVista } from '../ui/Esqueleto'
import { Panel } from '../ui/Panel'

interface Cargado { tab: TTablero | null; w: TWelch | null; perm: TPermutacion | null; neu: TNeurona | null; ia: TIa | null; avisos: string[] }

const SIN_NADA: Cargado = { tab: null, w: null, perm: null, neu: null, ia: null, avisos: [] }

/** Pide todo lo del tablero a la vez; lo que falla no tumba lo demás (cada escena avisa si le falta algo). */
async function cargar(hayLimpio: boolean): Promise<Cargado> {
  const [tab, w, perm, neu, ia] = await Promise.allSettled([
    hayLimpio ? api.tablero() : Promise.reject(new ApiError(409, 'Todavía no hay un conjunto limpio guardado.')),
    hayLimpio ? api.tstudent(0.05, 'two-sided') : Promise.reject(new ApiError(409, '')),
    hayLimpio ? api.permutacion(2000, 42) : Promise.reject(new ApiError(409, '')),
    hayLimpio ? api.neurona() : Promise.reject(new ApiError(409, '')),
    api.iaComparativa(),
  ])
  const v = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null)
  const avisos: string[] = []
  if (hayLimpio) {
    for (const [nombre, r] of [['las cifras del conjunto limpio', tab], ['la t de Welch', w], ['la permutación', perm], ['la neurona', neu]] as const) {
      if (r.status === 'rejected') avisos.push(`No se pudo cargar ${nombre}: ${(r.reason as Error).message}`)
    }
  }
  if (ia.status === 'rejected') avisos.push(`No se pudieron cargar los datos de IA: ${(ia.reason as Error).message}`)
  return { tab: v(tab), w: v(w), perm: v(perm), neu: v(neu), ia: v(ia), avisos }
}

/** ¿Ya se fue de pantalla (hacia arriba) la cabecera grande? Entonces aparece la franja con las cifras. */
function useCabeceraFuera(activo: boolean): boolean {
  const [fuera, setFuera] = useState(false)
  useEffect(() => {
    if (!activo) { setFuera(false); return }
    const el = document.getElementById('escena-portada')
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setFuera(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-64px 0px 0px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [activo])
  return fuera
}

export function TableroView() {
  const applied = useStore((s) => s.applied)
  const setView = useStore((s) => s.setView)
  const reducir = useReducedMotion() ?? false
  const [datos, setDatos] = useState<Cargado | null>(null)
  const [leng, setLeng] = useState<Leng>('java')
  const [foco, setFoco] = useState<IaFuenteId | null>(null)
  const [presentando, setPresentando] = useState<number | null>(null)       // escena desde la que se abrió la presentación (null = cerrada)
  const sha = applied?.output.sha256 ?? null

  useEffect(() => {
    let vivo = true
    setDatos(null)
    void cargar(sha !== null).then((d) => { if (vivo) setDatos(d) })
    return () => { vivo = false }
  }, [sha])

  const d = datos ?? SIN_NADA
  const defs = useMemo(() => construirEscenas({ ...d, leng }), [d, leng])
  const pelicula = usePelicula(defs, reducir)
  const activa = useEscenaActiva(pelicula)
  const cabeceraFuera = useCabeceraFuera(datos !== null && d.tab !== null)
  const onLeng = useCallback((v: Leng) => setLeng(v), [])
  const onPelicula = useCallback(() => pelicula.ir(0), [pelicula])
  const onPresentar = useCallback(() => setPresentando(Math.max(0, pelicula.escenaActiva())), [pelicula])
  const cerrarPresentacion = useCallback(() => setPresentando(null), [])

  // Durante la película, la pantalla acompaña a la escena que suena.
  useEffect(() => {
    if (activa < 0 || !defs[activa]) return
    document.getElementById(`escena-${defs[activa].id}`)?.scrollIntoView({ behavior: reducir ? 'auto' : 'smooth', block: 'start' })
  }, [activa, defs, reducir])

  /** Una escena, igual en el tablero y en la presentación. */
  const renderEscena = useCallback((e: EscenaDef, i: number): ReactNode => {
    const b = { p: pelicula, i, n: i + 1 }
    const f = { foco, onFoco: setFoco }
    switch (e.id as EscenaId) {
      case 'portada': return d.tab && <Portada p={pelicula} i={i} tab={d.tab} w={d.w} neu={d.neu} onPelicula={onPelicula} onPresentar={onPresentar} />
      case 'embudo': return d.tab && <Embudo {...b} tab={d.tab} />
      case 'distribucion': return d.tab && <Distribucion {...b} tab={d.tab} />
      case 'riesgo': return d.tab && <Riesgo {...b} tab={d.tab} />
      case 'probabilidad': return d.tab && <Probabilidad {...b} tab={d.tab} />
      case 'welch': return <Welch {...b} w={d.w} />
      case 'permutacion': return <Permutacion {...b} perm={d.perm} />
      case 'neurona': return <Neurona {...b} neu={d.neu} />
      case 'ia-tasas': return <IaTasas {...b} {...f} ia={d.ia} leng={leng} onLeng={onLeng} />
      case 'ia-detalle': return <IaDetalle {...b} {...f} ia={d.ia} leng={leng} onLeng={onLeng} />
      case 'cierre': return <Cierre {...b} tab={d.tab} w={d.w} neu={d.neu} ia={d.ia} />
    }
  }, [pelicula, d, leng, foco, onLeng, onPelicula, onPresentar])

  return (
    <div className="flex flex-col gap-6">
      {d.tab && datos !== null && (
        <FranjaCifras cifras={cifrasDe(d.tab, d.w, d.neu)} visible={cabeceraFuera && presentando === null} onPelicula={onPelicula} onPresentar={onPresentar} />
      )}

      {datos !== null && !d.tab && (
        <header className="max-w-[62ch]">
          <p className="lead">Tablero estadístico</p>
          <p className="small mt-2">Un solo tablero con la limpieza, la complejidad frente a los bugs, la prueba t de Welch, una neurona que predice y la comparación del código de personas con el de IA.</p>
        </header>
      )}

      {datos === null && <EsqueletoVista hero paneles={3} mensaje="Calculando el tablero… la permutación y la neurona tardan unos segundos la primera vez." />}

      {datos !== null && sha === null && (
        <Panel title="Faltan los datos limpios del proyecto" note="Las gráficas del proyecto salen del conjunto limpio y guardado.">
          <p className="small mb-3">Aplica y guarda la limpieza para ver las escenas de complejidad, la prueba t y la neurona. La comparación con código de IA no la necesita y ya está abajo.</p>
          <button type="button" className="chip" onClick={() => setView('limpieza')}>Ir a Limpieza visual</button>
        </Panel>
      )}

      {datos !== null && sha !== null && d.avisos.length > 0 && (
        <ul className="m-0 list-none p-0" aria-label="Avisos">
          {d.avisos.map((a) => <li key={a} className="rep-note small mb-2">{a}</li>)}
        </ul>
      )}

      {datos !== null && (
        <Escalonado className="flex flex-col gap-6">
          {defs.map((e, i) => <Fragment key={e.id}>{renderEscena(e, i)}</Fragment>)}
        </Escalonado>
      )}

      {datos !== null && defs.length > 0 && <BarraPelicula p={pelicula} escenas={defs} onPresentar={onPresentar} />}

      {presentando !== null && <Presentacion p={pelicula} defs={defs} inicio={presentando} renderEscena={renderEscena} onSalir={cerrarPresentacion} />}
    </div>
  )
}
