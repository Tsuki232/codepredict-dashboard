import { Suspense, lazy, useEffect } from 'react'
import type { ComponentType } from 'react'
import type { ViewId } from './app.config'
import { AdaDownModal } from './features/engine/AdaDownModal'
import { Shell } from './layout/Shell'
import { Escalonado } from './motion/Escalonado'
import { useStore } from './state/store'
import { BlurViewTransition } from './ui/BlurViewTransition'
import { EsqueletoVista } from './ui/Esqueleto'
import { Panel } from './ui/Panel'
import { FuenteView } from './views/FuenteView'

// Las vistas pesadas se cargan al abrirlas (lazy). Para añadir una vista: créala en src/views y regístrala aquí.
const LimpiezaView = lazy(() => import('./views/LimpiezaView').then((m) => ({ default: m.LimpiezaView })))
const CuadernoView = lazy(() => import('./views/CuadernoView').then((m) => ({ default: m.CuadernoView })))
const InformeView = lazy(() => import('./views/InformeView').then((m) => ({ default: m.InformeView })))
const InferenciaView = lazy(() => import('./views/InferenciaView').then((m) => ({ default: m.InferenciaView })))
const TableroView = lazy(() => import('./views/TableroView').then((m) => ({ default: m.TableroView })))

const VIEWS: Record<ViewId, ComponentType> = {
  fuente: FuenteView,
  limpieza: LimpiezaView,
  cuaderno: CuadernoView,
  tablero: TableroView,
  inferencia: InferenciaView,
  informe: InformeView,
}

function ServerDown({ message }: { message: string }) {
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <p className="lead">El panel necesita su servidor: sin él no hay datos que limpiar.</p>
      <Panel title="No hay conexión con el servidor" note={message}>
        <p className="small mb-3">Arráncalo desde la carpeta del proyecto y recarga esta página:</p>
        <pre className="math">{`.\\scripts\\run.ps1`}</pre>
      </Panel>
    </div>
  )
}

export default function App() {
  const init = useStore((s) => s.init)
  const booting = useStore((s) => s.booting)
  const serverError = useStore((s) => s.serverError)
  const view = useStore((s) => s.view)
  useEffect(() => { void init() }, [init])

  const View = VIEWS[view]
  return (
    <Shell>
      {serverError ? (
        <ServerDown message={serverError} />
      ) : booting ? (
        <EsqueletoVista paneles={2} mensaje="Leyendo los datos…" />
      ) : (
        <BlurViewTransition viewKey={view}>
          <Suspense fallback={<EsqueletoVista paneles={2} mensaje="Cargando vista…" />}>
            <Escalonado><View /></Escalonado>
          </Suspense>
        </BlurViewTransition>
      )}
      <AdaDownModal />
    </Shell>
  )
}
