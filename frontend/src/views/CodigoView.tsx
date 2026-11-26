import { Loader } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import type { CeldaCodigo } from '../lib/api'
import { highlight } from '../ui/CodigoPython'

interface Archivo { nombre: string; texto: string }

/** Une las celdas en un solo «archivo». Cada pieza lleva su título como comentario; la explicación no se muestra. */
function archivos(celdas: CeldaCodigo[]): Archivo[] {
  const juntar = (cs: CeldaCodigo[], cabecera: string) => `${cabecera}\n\n` + cs.map((c) => `# ── ${c.title} ${'─'.repeat(Math.max(2, 78 - c.title.length))}\n${c.code}`).join('\n\n\n') + '\n'
  const real = celdas.filter((c) => !c.ejemplo)
  const ejemplo = celdas.filter((c) => c.ejemplo)
  return [
    { nombre: 'neurona.py', texto: juntar(real, '# La neurona de CodePredict (backend/app/core/tstudent.py): lo que el motor de Python ejecuta.') },
    ...(ejemplo.length ? [{ nombre: 'ejemplo_red_neuronal.py', texto: juntar(ejemplo, '# Solo un ejemplo para leer: nada de esto se ejecuta ni lo usa el tablero.') }] : []),
  ]
}

/** El código Python de la neurona, como en un editor de código: ancho completo, números de línea y pestañas por archivo. Es el código real del servidor. */
export function CodigoView() {
  const [celdas, setCeldas] = useState<CeldaCodigo[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [activo, setActivo] = useState(0)
  useEffect(() => { api.codigoNeurona().then((d) => setCeldas(d.cells)).catch((e: Error) => setErr(e.message)) }, [])
  const files = useMemo(() => (celdas ? archivos(celdas) : []), [celdas])
  const f = files[Math.min(activo, files.length - 1)]
  const coloreado = useMemo(() => (f ? highlight(f.texto) : null), [f])
  const lineas = f ? f.texto.replace(/\n$/, '').split('\n').length : 0

  if (err) return <p className="small" role="alert">No se pudo cargar el código: {err}. Revisa el servidor.</p>
  if (!celdas || !f) return <p className="label flex items-center justify-center gap-2 py-24" role="status"><Loader size={14} className="animate-spin" aria-hidden /> Cargando el código…</p>
  return (
    <div className="editor" role="region" aria-label="Código Python de la neurona">
      <div className="editor-barra" role="tablist">
        <span className="editor-puntos" aria-hidden><i /><i /><i /></span>
        {files.map((a, i) => (
          <button key={a.nombre} type="button" role="tab" aria-selected={a === f} className="editor-tab" onClick={() => setActivo(i)}>{a.nombre}</button>
        ))}
        <span className="editor-info">Python · {lineas} líneas</span>
      </div>
      <div className="editor-cuerpo" tabIndex={0}>
        <pre className="editor-nums" aria-hidden>{Array.from({ length: lineas }, (_, i) => i + 1).join('\n')}</pre>
        <pre className="editor-codigo" aria-label={`Código de ${f.nombre}`}>{coloreado}</pre>
      </div>
    </div>
  )
}
