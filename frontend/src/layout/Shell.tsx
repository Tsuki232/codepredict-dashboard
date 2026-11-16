import { Moon, Sun } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { ALL_ITEMS, APP, NAV, type ViewId, itemOf } from '../app.config'
import { api } from '../lib/api'
import { fmtInt } from '../lib/format'
import { useStore } from '../state/store'
import type { Health } from '../state/types'

/** Marca de la aplicación: tres barras (distribución de una métrica de código). */
function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="1" y="1" width="26" height="26" rx="7" fill="var(--ink)" />
      <rect x="6" y="14" width="3.6" height="8" rx="1" fill="var(--bg)" />
      <rect x="12.2" y="7" width="3.6" height="15" rx="1" fill="var(--serie-2)" stroke="var(--bg)" strokeWidth="0.8" />
      <rect x="18.4" y="11" width="3.6" height="11" rx="1" fill="var(--bg)" />
    </svg>
  )
}

function Item({ id }: { id: ViewId }) {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const reduce = useReducedMotion()
  const { icon: Icon, label } = itemOf(id)
  const active = view === id
  return (
    <a href={`#/${id}`} className="nav-item" aria-current={active ? 'page' : undefined}
      onClick={(e) => { e.preventDefault(); setView(id) }}>
      {active && (
        <motion.span layoutId="nav-pill" className="nav-pill"
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }} />
      )}
      <span className="nav-content"><Icon size={17} aria-hidden /> {label}</span>
    </a>
  )
}

/** Estado de Ada en una frase (siempre con texto: el color solo acompaña). */
function adaLabel(h: Health | null): { text: string; color: string } {
  if (!h) return { text: 'Ada: sin conexión', color: 'var(--bad)' }
  const a = h.ada
  if (a.mode === 'python') return { text: 'Motor: Python local (sin Ada)', color: 'var(--warn)' }
  if (a.ready) return { text: a.mode === 'remote' ? 'Ada: lista (API remota)' : 'Ada: lista', color: 'var(--ok)' }
  if (a.phase === 'error') return { text: 'Ada: no disponible', color: 'var(--bad)' }
  return { text: 'Ada: cargando…', color: 'var(--warn)' }
}

export function Sidebar() {
  const health = useStore((s) => s.health)
  const ada = adaLabel(health)
  return (
    <aside className="sidebar" aria-label="Navegación principal">
      <div className="flex items-center gap-3 px-3 pb-6">
        <Mark />
        <div className="leading-tight">
          <p className="font-semibold">{APP.name}</p>
          <p className="small">{APP.tagline}</p>
        </div>
      </div>
      {NAV.map((g, i) => (
        <nav key={g.group} className={`flex flex-col gap-1 ${i ? 'mt-6' : ''}`} aria-label={g.group}>
          <p className="nav-group">{g.group}</p>
          {g.items.map((it) => <Item key={it.id} id={it.id} />)}
        </nav>
      ))}
      <div className="mt-auto px-3 pt-6">
        <p className="small flex items-center gap-2"><span className="nav-dot" style={{ background: ada.color, margin: 0 }} aria-hidden /> {ada.text}</p>
        {health?.ada.mode === 'python' && (
          <button type="button" className="chip mt-2" style={{ height: 30 }}
            onClick={() => { void api.setEngine('ada').then(() => window.location.reload()).catch(() => { /* el servidor lo dirá en la próxima petición */ }) }}>
            Volver a Ada
          </button>
        )}
        {APP.footer.map((t) => <p key={t} className="small">{t}</p>)}
      </div>
    </aside>
  )
}

/** Barra superior: título de la vista, resumen de parámetros activos y cambio de tema. */
export function Topbar() {
  const view = useStore((s) => s.view)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const preview = useStore((s) => s.preview)
  const applied = useStore((s) => s.applied)
  const profile = useStore((s) => s.profile)
  const { title } = itemOf(view)
  const rowsIn = profile?.rows ?? preview?.rows_in
  return (
    <header className="topbar">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 lg:hidden"><Mark /></span>
        <div className="min-w-0">
          <p className="small truncate">{APP.name}</p>
          <h1 className="truncate text-[1.0625rem] font-semibold leading-tight tracking-[-0.015em] sm:text-[1.125rem]">{title}</h1>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <dl className="topbar-metrics hidden md:flex" aria-label="Estado de los datos">
          <div><dt>Crudo</dt><dd>{fmtInt(rowsIn)}</dd></div>
          <span className="topbar-sep" aria-hidden />
          <div><dt>Con estas reglas</dt><dd>{fmtInt(preview?.rows_out)}</dd></div>
          <span className="topbar-sep" aria-hidden />
          <div><dt>Guardado</dt><dd>{applied ? fmtInt(applied.output.rows) : 'aún no'}</dd></div>
        </dl>
        <button className="btn-icon" title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  )
}

/** Barra inferior para el móvil: las mismas vistas, con etiqueta corta. */
export function TabBar() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  return (
    <nav className="tabbar" aria-label="Vistas">
      {ALL_ITEMS.map(({ id, icon: Icon, short }) => (
        <button key={id} className="tab" aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
          <Icon size={19} aria-hidden /><span>{short}</span>
        </button>
      ))}
    </nav>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="page" id="contenido">{children}</main>
      </div>
      <TabBar />
    </div>
  )
}
