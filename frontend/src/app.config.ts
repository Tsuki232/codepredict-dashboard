/**
 * Configuración de la aplicación: nombre, menú y vistas.
 * Para añadir una vista: 1) agrega su id a `ViewId`, 2) agrégala a `NAV`, 3) regístrala en `VIEWS` (src/App.tsx).
 */
import { Database, FileText, FlaskConical, LayoutDashboard, NotebookPen, ScanSearch } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const APP = {
  name: 'CodePredict AI',
  tagline: 'Limpieza e inferencia',
  footer: ['Estadística Inferencial y Ciencia de Datos', 'Unified Bug Dataset · nivel archivo'],
}

export type ViewId = 'fuente' | 'limpieza' | 'cuaderno' | 'tablero' | 'inferencia' | 'informe'
export const DEFAULT_VIEW: ViewId = 'fuente'

export interface NavItem { id: ViewId; label: string; short: string; title: string; icon: LucideIcon }
export interface NavGroup { group: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    group: 'Proceso de datos',
    items: [
      { id: 'fuente', label: 'Fuente y perfil', short: 'Fuente', title: 'Fuente y perfil de los datos', icon: Database },
      { id: 'limpieza', label: 'Limpieza visual', short: 'Limpieza', title: 'Limpieza paso a paso', icon: ScanSearch },
      { id: 'cuaderno', label: 'Cuaderno en vivo', short: 'Cuaderno', title: 'Cuaderno: ejecutar celda por celda', icon: NotebookPen },
    ],
  },
  {
    group: 'Análisis',
    items: [
      { id: 'tablero', label: 'Tablero estadístico', short: 'Tablero', title: 'Tablero estadístico con modo película', icon: LayoutDashboard },
      { id: 'inferencia', label: 'Inferencia', short: 'Inferencia', title: 'Inferencia con la t de Student', icon: FlaskConical },
      { id: 'informe', label: 'Informe en vivo', short: 'Informe', title: 'Informe en vivo y PDF', icon: FileText },
    ],
  },
]

export const ALL_ITEMS: NavItem[] = NAV.flatMap((g) => g.items)
export const VIEW_IDS = ALL_ITEMS.map((i) => i.id)
export const itemOf = (id: ViewId) => ALL_ITEMS.find((i) => i.id === id)!
