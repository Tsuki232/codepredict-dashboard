import { tQuantile } from '../../lib/tdist'
import { Panel } from '../../ui/Panel'
import { ComoLeerla, num } from './lienzo'

/** Áreas de la cola derecha (una sola cola) de cada columna. La de dos colas es el doble. */
const COLAS = [0.1, 0.05, 0.025, 0.01, 0.005, 0.0005]
const FILAS = [...Array.from({ length: 30 }, (_, i) => i + 1), 40, 50, 60, 80, 100, 120]
/** Fila «∞» (la normal estándar): z que deja cada área a la derecha. */
const INFINITO = [1.282, 1.645, 1.96, 2.326, 2.576, 3.291]

const colas = (p: number) => num(p, 4)

/**
 * Tabla de la distribución t de Student: el valor crítico t* que deja un área p a su derecha, por grados de libertad (gl).
 * Se calcula con la misma `tQuantile` que dibuja la campana (verificada contra SciPy), así que coincide con el libro y con la gráfica de arriba.
 * Resalta la columna del α elegido y la fila de los gl de los datos.
 */
export function SeccionTabla({ gl, alpha }: { gl: number; alpha: number }) {
  const colAlpha = COLAS.findIndex((p) => Math.abs(p - alpha / 2) < 1e-9)
  const filaDatos = gl > 120 ? 'inf' : Math.max(...FILAS.filter((f) => f <= gl))        // la fila de gl más cercana por debajo (la convención conservadora de los libros)
  const tc = colAlpha >= 0 ? (filaDatos === 'inf' ? INFINITO[colAlpha] : tQuantile(1 - COLAS[colAlpha], filaDatos)) : null

  return (
    <Panel title="Tabla de la distribución de t de Student" note="El valor crítico t* que deja un área p a su derecha, para cada número de grados de libertad (gl).">
      <div className="overflow-auto" style={{ maxHeight: 440 }} tabIndex={0} role="region" aria-label="Tabla de valores críticos de la t de Student">
        <table className="data-table" aria-label="Valores críticos de la t de Student">
          <thead style={{ position: 'sticky', top: 0, background: 'var(--paper)', zIndex: 1 }}>
            <tr>
              <th scope="col" rowSpan={2} style={{ verticalAlign: 'bottom' }}>gl</th>
              <th scope="col" colSpan={COLAS.length} style={{ textAlign: 'center' }}>Área en la cola derecha (una cola)</th>
            </tr>
            <tr>
              {COLAS.map((p, j) => (
                <th key={p} scope="col" className="num" style={j === colAlpha ? { color: 'var(--ink)', fontWeight: 700 } : undefined}>
                  {colas(p)}
                  <span className="block" style={{ fontWeight: 400, fontSize: '0.75rem' }}>dos colas {colas(2 * p)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...FILAS, 'inf' as const].map((f) => (
              <tr key={f} data-selected={f === filaDatos}>
                <th scope="row" style={{ textAlign: 'left', fontWeight: f === filaDatos ? 700 : 500, color: f === filaDatos ? 'var(--ink)' : undefined }}>
                  {f === 'inf' ? '∞ (normal)' : f}
                </th>
                {COLAS.map((p, j) => (
                  <td key={p} className="num" style={j === colAlpha ? { fontWeight: 700 } : undefined}>
                    {num(f === 'inf' ? INFINITO[j] : tQuantile(1 - p, f), 3)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ComoLeerla titulo="Cómo leerla">
          <p>Busca la fila de tus <b>grados de libertad</b> y la columna del área que quieres dejar en la cola. El número que cruza es el <b>valor crítico t*</b>: si el |t| de la prueba lo supera, cae en la zona de rechazo (las colas rayadas de la gráfica).</p>
          <p>Para una prueba de <b>dos colas</b> con α, el área se reparte mitad y mitad: usa la columna α/2 (por eso cada columna dice también su equivalente en dos colas).</p>
        </ComoLeerla>
        <ComoLeerla titulo="Con tus datos">
          <p>Tus datos tienen <b>{Math.round(gl).toLocaleString('es-CO')} gl</b>, así que la fila es {filaDatos === 'inf' ? <b>∞</b> : <b>{filaDatos}</b>} y la t se confunde con la normal.
            {tc != null ? <> Con α = {num(alpha, 2)} a dos colas el valor crítico es <b>±{num(tc, 3)}</b>: la misma cifra que marca la gráfica de arriba.</> : null}</p>
          <p>Las filas son las de los libros; los valores se calculan con la misma función que dibuja la campana, comprobada contra SciPy.</p>
        </ComoLeerla>
      </div>
    </Panel>
  )
}
