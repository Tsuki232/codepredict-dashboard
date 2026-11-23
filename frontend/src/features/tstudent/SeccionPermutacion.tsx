import { Loader } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { fmtP } from '../../lib/format'
import { curva, normalPdf } from '../../lib/tdist'
import { Panel } from '../../ui/Panel'
import { Verified } from '../../ui/Verified'
import { useReproduccion } from './animacion'
import { ALTO, ANCHO, ComoLeerla, EjeX, EjeY, Lienzo, MARGEN, escala, marcas, num, ruta } from './lienzo'
import type { TPermutacion, TWelch } from './tipos'

const LIM = 6
const ANCHO_CAJA = 0.25
const CAJAS = Math.round((2 * LIM) / ANCHO_CAJA)

/** 4. Comprobación sin fórmulas: se barajan las etiquetas «con bug / sin bug» miles de veces y se mira si la t real podría salir por azar. */
export function SeccionPermutacion({ w, sha }: { w: TWelch; sha: string }) {
  const [semilla, setSemilla] = useState(42)
  const [datos, setDatos] = useState<TPermutacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { k, reproducir, corriendo, ref } = useReproduccion(5200, false)

  useEffect(() => {
    let vivo = true
    setDatos(null); setError(null)
    api.permutacion(2000, semilla).then((d) => { if (vivo) { setDatos(d); reproducir() } }).catch((e: Error) => { if (vivo) setError(e.message) })
    return () => { vivo = false }
  }, [semilla, sha, reproducir])

  const X = escala([-LIM, LIM], [MARGEN.l, ANCHO - MARGEN.r])
  const Y = escala([0, 0.5], [ALTO - MARGEN.b, MARGEN.t])
  const normal = useMemo(() => curva(normalPdf, -LIM, LIM, 240), [])
  const hechas = datos ? Math.floor(k * datos.t_perm.length) : 0
  const conteos = useMemo(() => {
    const c = new Array(CAJAS).fill(0)
    if (!datos) return c
    for (let i = 0; i < hechas; i++) { const j = Math.floor((datos.t_perm[i] + LIM) / ANCHO_CAJA); if (j >= 0 && j < CAJAS) c[j] += 1 }
    return c
  }, [datos, hechas])
  const B = datos?.repeticiones ?? 0
  const xReal = datos ? Math.min(LIM * 0.985, datos.t_obs) : 0
  const real = datos?.t_obs ?? w.t

  return (
    <Panel title="4. Comprobación sin fórmulas: barajar las etiquetas" note="Un segundo algoritmo, independiente de la fórmula de la t, que llega a la misma conclusión.">
      <div ref={ref}>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <button type="button" className="chip" disabled={!datos || corriendo} onClick={reproducir}>Repetir la animación</button>
          <button type="button" className="chip" disabled={!datos && !error} onClick={() => setSemilla(Math.floor(Math.random() * 1_000_000))}>Barajar de nuevo (otra semilla)</button>
          <span className="small num" role="status">{error ? `No se pudo calcular: ${error}` : !datos ? <><Loader size={13} className="animate-spin" aria-hidden /> Barajando 2 000 veces en el servidor…</> : `Barajada ${hechas.toLocaleString('es-CO')} de ${B.toLocaleString('es-CO')} · semilla ${datos.semilla}`}</span>
        </div>

        <Lienzo titulo="Valores de t obtenidos al barajar las etiquetas" descripcion={datos ? `Histograma de ${B} valores de t con etiquetas barajadas; forman una campana centrada en 0 que llega como máximo a ±${num(datos.max_abs_perm, 2)}. La t real, ${num(real, 2)}, queda muy fuera, a la derecha.` : 'Cargando.'}>
          <EjeY Y={Y} marcasY={marcas(0, 0.5, 5)} x={MARGEN.l} xFin={ANCHO - MARGEN.r} etiqueta="Densidad" formato={(v) => num(v, 1)} />
          <EjeX X={X} marcasX={marcas(-LIM, LIM, 12)} y={ALTO - MARGEN.b} etiqueta="Valor de t en cada barajada" formato={(v) => num(v, 0)} />
          {conteos.map((c, j) => {
            const dens = hechas ? c / (hechas * ANCHO_CAJA) : 0
            const x0 = -LIM + j * ANCHO_CAJA
            return dens > 0 ? (
              <rect key={j} x={X(x0) + 1} y={Y(Math.min(dens, 0.5))} width={Math.max(1, X(x0 + ANCHO_CAJA) - X(x0) - 2)} height={Y(0) - Y(Math.min(dens, 0.5))} rx="2" fill="var(--serie-1)" fillOpacity="0.62">
                <title>{`t entre ${num(x0, 2)} y ${num(x0 + ANCHO_CAJA, 2)}: ${c} barajadas`}</title>
              </rect>
            ) : null
          })}
          <path d={ruta(normal, X, Y)} fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeDasharray="7 6" />
          {datos && k > 0.98 && (
            <g>
              <line x1={X(datos.max_abs_perm)} x2={X(datos.max_abs_perm)} y1={Y(0)} y2={Y(0.2)} stroke="var(--muted)" strokeWidth="1.6" strokeDasharray="3 4" />
              <text x={X(datos.max_abs_perm)} y={Y(0.2) - 6} textAnchor="middle" fontSize="12" fill="var(--ink-2)">la barajada más extrema: {num(datos.max_abs_perm, 2)}</text>
            </g>
          )}
          {datos && (
            <g opacity={k > 0.98 ? 1 : 0.25}>
              <line x1={X(xReal)} x2={X(xReal)} y1={Y(0)} y2={Y(0.36)} stroke="var(--serie-2)" strokeWidth="3.4" />
              <text x={X(xReal) - 8} y={Y(0.36) - 18} textAnchor="end" fontSize="15" fontWeight="700" fill="var(--serie-2)">t real = {num(real, 2)}  →  muy a la derecha</text>
            </g>
          )}
          <g fontSize="13">
            <rect x={MARGEN.l + 14} y={MARGEN.t + 6} width="22" height="14" rx="2" fill="var(--serie-1)" fillOpacity="0.62" />
            <text x={MARGEN.l + 44} y={MARGEN.t + 18} fill="var(--ink-2)">t de cada barajada</text>
            <line x1={MARGEN.l + 14} x2={MARGEN.l + 36} y1={MARGEN.t + 38} y2={MARGEN.t + 38} stroke="var(--ink)" strokeWidth="2.6" strokeDasharray="7 6" />
            <text x={MARGEN.l + 44} y={MARGEN.t + 42} fill="var(--ink-2)">la campana que predice la teoría</text>
          </g>
        </Lienzo>
      </div>

      {datos && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="overflow-x-auto">
            <table className="data-table" aria-label="Tres formas de llegar a la misma conclusión">
              <thead><tr><th scope="col">Camino</th><th scope="col">Qué calcula</th><th scope="col">Resultado</th></tr></thead>
              <tbody>
                <tr><td>Fórmula a mano</td><td>t y valor p con la fórmula de Welch</td><td>t = {num(w.t, 4)} · p = {fmtP(w.p)}</td></tr>
                <tr><td>SciPy</td><td>La misma prueba con la librería</td><td>t = {num(w.verificacion.scipy_t, 4)} · p = {fmtP(w.verificacion.scipy_p)}</td></tr>
                <tr><td>Barajar etiquetas</td><td>Cuántas de {B.toLocaleString('es-CO')} barajadas llegan a |t| ≥ {num(Math.abs(real), 2)}</td><td><b>{datos.extremos}</b> · p {datos.extremos === 0 ? `< ${num(datos.p_minimo, 4)}` : `≈ ${num(datos.p, 4)}`}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 flex flex-wrap items-center gap-2 small">
              <Verified ok={w.verificacion.coincide} label="Fórmula = SciPy" />
              {w.alternativa === 'two-sided'
                ? <Verified ok={(datos.p < w.alpha) === w.rechaza} label="Barajar llega a la misma decisión" methods={['permutación de etiquetas']} />
                : <span>Barajar mide las dos colas; para comparar con esta hipótesis de una cola, elige «Distintas (≠)».</span>}
            </p>
          </div>
          <ComoLeerla titulo="Cómo funciona el algoritmo (y qué comprueba)">
            <ol className="flex list-decimal flex-col gap-1 pl-5">
              <li>Se juntan los {w.meta.filas.toLocaleString('es-CO')} archivos con su complejidad.</li>
              <li>Se <b>borran</b> las etiquetas «con bug / sin bug» y se reparten <b>al azar</b> (tantas «con bug» como había: {w.grupos.con_bug.n.toLocaleString('es-CO')}).</li>
              <li>Se calcula la t de esa repartición al azar.</li>
              <li>Se repite {B.toLocaleString('es-CO')} veces: cada barra del gráfico es una de esas t.</li>
              <li>Se mira si la t <b>real</b> ({num(real, 2)}) se parece a las barajadas.</li>
            </ol>
            <p>Si la etiqueta no importara, la t real sería una más de la nube (la campana azul, centrada en 0 y casi igual a la teórica). Está a más de {num(Math.abs(real) / Math.max(datos.max_abs_perm, 0.01), 1)} veces el valor más extremo de las barajadas: ninguna de {B.toLocaleString('es-CO')} la alcanza.</p>
            <p><b>Límite honesto:</b> con {B.toLocaleString('es-CO')} barajadas el menor valor p que se puede medir es 1/{(B + 1).toLocaleString('es-CO')} = {num(datos.p_minimo, 4)}; por eso se dice «p &lt; {num(datos.p_minimo, 4)}» y no «p = 0». La animación reproduce las barajadas que el servidor ya calculó (tardó unos segundos).</p>
          </ComoLeerla>
        </div>
      )}
    </Panel>
  )
}
