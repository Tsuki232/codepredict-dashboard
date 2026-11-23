import { Loader } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { ADA_DOWN_EVENT } from '../../lib/engine'

/**
 * Modal «Ada no disponible». Se abre cuando el servidor del panel avisa que Ada no se puede usar (no responde, no está instalada o rechazó la clave).
 * La persona decide: seguir con el motor Python de ESTE equipo (todo se calcula aquí, y el panel lo rotula así) o reintentar con Ada.
 * Nunca se cambia de motor en silencio.
 */
export function AdaDownModal() {
  const ref = useRef<HTMLDialogElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const on = (e: Event) => setMessage((e as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener(ADA_DOWN_EVENT, on)
    return () => window.removeEventListener(ADA_DOWN_EVENT, on)
  }, [])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (message !== null && !d.open) d.showModal()
    if (message === null && d.open) d.close()
  }, [message])

  const usarPython = async () => {
    setBusy(true); setError(null)
    try {
      await api.setEngine('python')
      window.location.reload()                 // el panel vuelve a leer todo con el motor elegido
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <dialog ref={ref} className="ada-dialog" aria-labelledby="ada-dialog-title" onClose={() => setMessage(null)}>
      <h2 id="ada-dialog-title" className="h2">Ada no está disponible</h2>
      <p className="small mt-2">{message}</p>
      <p className="mt-4">¿Cómo quieres seguir? Puedes usar el <strong>motor Python de este equipo</strong>, o reintentar con Ada cuando el PC que la corre esté encendido.</p>
      <ul className="small mt-3 flex list-disc flex-col gap-1 pl-5">
        <li>Con Python, la limpieza se calcula <strong>en este equipo</strong> (pandas y DuckDB), cada resultado por dos vías independientes.</li>
        <li><strong>No es Ada</strong>: el panel lo dirá en cada resultado. La estadística de Inferencia (t de Student) <strong>nunca usa Ada</strong>: siempre se calcula aquí, con Python.</li>
        <li>Python local no incluye el análisis de sensibilidad automático de Ada ni su registro de auditoría.</li>
      </ul>
      {error && <p className="small mt-3" style={{ color: 'var(--bad)' }} role="alert">⚠ {error}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="chip" disabled={busy} style={{ height: 40, paddingInline: 18, background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' }}
          onClick={() => void usarPython()}>
          {busy ? <Loader size={15} className="nb-spin mr-2" aria-hidden /> : null} Usar el motor Python de este equipo
        </button>
        <button type="button" className="chip" disabled={busy} style={{ height: 40, paddingInline: 18 }} onClick={() => window.location.reload()}>Reintentar con Ada</button>
        <button type="button" className="chip" disabled={busy} style={{ height: 40, paddingInline: 18 }} onClick={() => setMessage(null)}>Ahora no</button>
      </div>
    </dialog>
  )
}
