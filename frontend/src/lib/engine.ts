/** Qué motor calculó los resultados (Ada local, Ada remota o el motor Python de este equipo) y cómo avisar al panel cuando Ada no está disponible. */

export type EngineMode = 'local' | 'remote' | 'python' | null | undefined

/** Evento que se dispara cuando el servidor responde «Ada no está disponible»: el panel abre el modal para elegir Python o reintentar. */
export const ADA_DOWN_EVENT = 'ada-down'

/** Nombre honesto del motor para rotular cifras: NUNCA «Ada» si las calculó Python. */
export const engineName = (a?: { mode?: EngineMode } | null): string => (a?.mode === 'python' ? 'Python local' : 'Ada')

/** Código que el servidor pone en un 503 cuando Ada no se puede usar (no está, no responde o rechazó la clave). Un 503 «cargando» no lo lleva. */
export const isAdaDownCode = (code: unknown): boolean => code === 'ada_no_disponible'

/** Si el estado de Ada que informa el servidor dice que no se puede usar (y la persona no eligió Python), el texto para el aviso; si no, null. */
export function adaDownMessage(a?: { phase?: string; mode?: EngineMode; motor?: string; error?: string | null } | null): string | null {
  if (!a || a.phase !== 'error' || a.mode === 'python' || a.motor === 'python') return null
  return (a.error ?? '').replace(/^\w*(Error|Exception): /, '') || 'Ada no está disponible.'
}

export function announceAdaDown(message: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ADA_DOWN_EVENT, { detail: { message } }))
}
