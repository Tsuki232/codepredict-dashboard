import type { CSSProperties } from 'react'

/** Un bloque gris con un brillo suave que lo cruza: ocupa el lugar de lo que todavía se está calculando (así la página no salta cuando llegan los datos). */
export function Esq({ w = '100%', h = 14, r = 8, className = '', style }: { w?: number | string; h?: number | string; r?: number; className?: string; style?: CSSProperties }) {
  return <div className={`esq ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden />
}

function PanelEsq({ alto }: { alto: number }) {
  return (
    <div className="panel" aria-hidden>
      <Esq w="42%" h={20} />
      <Esq w="68%" h={12} className="mt-3" />
      <Esq h={alto} r={10} className="mt-6" />
    </div>
  )
}

/**
 * La silueta de una vista mientras carga. Con `hero` imita la cabecera grande del tablero (kicker, dos líneas de título, botones y cinco cifras).
 * El texto de estado es lo único que leen los lectores de pantalla; las formas son decorativas.
 */
export function EsqueletoVista({ paneles = 3, hero = false, mensaje = 'Cargando…' }: { paneles?: number; hero?: boolean; mensaje?: string }) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite">
      {hero && (
        <div aria-hidden className="pb-2">
          <Esq w={260} h={13} />
          <Esq w="min(620px, 92%)" h={46} r={10} className="mt-4" />
          <Esq w="min(470px, 70%)" h={46} r={10} className="mt-2.5" />
          <div className="mt-6 flex gap-3"><Esq w={178} h={44} r={999} /><Esq w={130} h={44} r={999} /></div>
          <div className="mt-8 grid grid-cols-2 gap-x-7 gap-y-5 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((j) => <div key={j}><Esq w="70%" h={11} /><Esq w="55%" h={34} r={8} className="mt-2.5" /><Esq w="80%" h={11} className="mt-2.5" /></div>)}
          </div>
        </div>
      )}
      {Array.from({ length: paneles }, (_, j) => <PanelEsq key={j} alto={j % 2 ? 180 : 230} />)}
      <p className="label text-center">{mensaje}</p>
    </div>
  )
}
