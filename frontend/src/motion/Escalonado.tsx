import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { contenedor, elemento } from './tokens'

/** Agrupa una vista: sus paneles (y todo lo que use `Aparece`) entran uno tras otro al montarse. */
export function Escalonado({ children, className }: { children: ReactNode; className?: string }) {
  const reducir = useReducedMotion() ?? false
  const v = useMemo(() => contenedor(reducir), [reducir])
  return <motion.div className={className} variants={v} initial="oculto" animate="visible">{children}</motion.div>
}

/** Un elemento suelto que entra con el grupo (opacidad + desplazamiento + escala). */
export function Aparece({ children, className }: { children: ReactNode; className?: string }) {
  const reducir = useReducedMotion() ?? false
  const v = useMemo(() => elemento(reducir), [reducir])
  return <motion.div className={className} variants={v}>{children}</motion.div>
}
