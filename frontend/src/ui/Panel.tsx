import type { ReactNode } from 'react'

/** Panel: agrupa contenido con un título. Un solo nivel, nunca anidado. */
export function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`} aria-label={title}>
      <header className="mb-4">
        <h2 className="h2">{title}</h2>
        {note && <p className="small mt-1 max-w-[60ch]">{note}</p>}
      </header>
      {children}
    </section>
  )
}

/** Fila de una lista de medidas: «Etiqueta ········· valor». */
export function Row({ label, children, color }: { label: string; children: ReactNode; color?: string }) {
  return (
    <div>
      <dt>{label}</dt><span className="dots" aria-hidden />
      <dd style={{ color }}>{children}</dd>
    </div>
  )
}

/** Lista de medidas con puntos guía, como una hoja de mediciones. */
export function Readout({ children }: { children: ReactNode }) {
  return <dl className="readout">{children}</dl>
}
