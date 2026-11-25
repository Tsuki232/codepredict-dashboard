import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { elemento } from '../motion/tokens'

/**
 * Panel: agrupa contenido con un título. Un solo nivel, nunca anidado.
 * Entra con el grupo de su vista (`Escalonado`): sube, se aclara y crece un poco, uno tras otro. Fuera de un grupo se muestra sin animar.
 */
export function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  const reducir = useReducedMotion() ?? false
  const variantes = useMemo(() => elemento(reducir), [reducir])
  return (
    <motion.section className={`panel ${className}`} aria-label={title} variants={variantes}>
      <header className="mb-4">
        <h2 className="h2">{title}</h2>
        {note && <p className="small mt-1 max-w-[60ch]">{note}</p>}
      </header>
      {children}
    </motion.section>
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
