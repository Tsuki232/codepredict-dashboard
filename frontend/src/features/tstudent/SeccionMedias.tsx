import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { curva, tPdf } from '../../lib/tdist'
import { Panel } from '../../ui/Panel'
import { useReproduccion } from './animacion'
import { ALTO, ANCHO, ComoLeerla, EjeX, EjeY, Lienzo, MARGEN, areaBajo, escala, marcas, num, ruta } from './lienzo'
import type { TGrupo, TWelch } from './tipos'

const COLOR = { con_bug: 'var(--serie-2)', sin_bug: 'var(--serie-1)' } as const
const NOMBRE = { con_bug: 'Con bug', sin_bug: 'Sin bug' } as const

/** Dónde puede estar la media verdadera de cada grupo: una campana t (escalada) alrededor de la media muestral, con el 95 % central sombreado. */
export function SeccionMedias({ w }: { w: TWelch }) {
  const reducir = useReducedMotion()
  const { k, reproducir, ref } = useReproduccion(1600)
  const g = w.grupos
  const nivel = Math.round((1 - w.alpha) * 100)

  const { lo, hi, ymax, curvas } = useMemo(() => {
    const grupos = Object.entries(g) as [keyof typeof g, TGrupo][]
    const lo = Math.min(...grupos.map(([, d]) => d.media - 6 * d.se))
    const hi = Math.max(...grupos.map(([, d]) => d.media + 6 * d.se))
    const f = (d: TGrupo) => (u: number) => tPdf((u - d.media) / d.se, d.gl) / d.se
    const curvas = grupos.map(([id, d]) => ({ id, d, f: f(d), pts: curva(f(d), lo, hi, 700) }))
    return { lo, hi, ymax: Math.max(...grupos.map(([, d]) => tPdf(0, d.gl) / d.se)) * 1.18, curvas }
  }, [g])

  const X = escala([lo, hi], [MARGEN.l, ANCHO - MARGEN.r])
  const Y = escala([0, ymax], [ALTO - MARGEN.b, MARGEN.t])
  const yMedio = Y(ymax * 0.55)

  return (
    <Panel title="2. Dónde está la media de cada grupo" note={`Cada media se calculó con una muestra, así que tiene incertidumbre. La t de Student la mide: el intervalo de confianza del ${nivel} %.`}>
      <div ref={ref}>
        <Lienzo titulo="Campanas t de la media de cada grupo" descripcion={`Con bug: media ${num(g.con_bug.media, 2)}, intervalo de ${num(g.con_bug.ic_bajo, 2)} a ${num(g.con_bug.ic_alto, 2)}. Sin bug: media ${num(g.sin_bug.media, 2)}, intervalo de ${num(g.sin_bug.ic_bajo, 2)} a ${num(g.sin_bug.ic_alto, 2)}. Las campanas no se tocan.`}>
          <EjeY Y={Y} marcasY={marcas(0, ymax, 4)} x={MARGEN.l} xFin={ANCHO - MARGEN.r} etiqueta="Densidad" formato={(v) => num(v, 1)} />
          <EjeX X={X} marcasX={marcas(lo, hi, 11)} y={ALTO - MARGEN.b} etiqueta="Complejidad media (McCC)" formato={(v) => num(v, 0)} />
          {curvas.map(({ id, d, f, pts }) => (
            <g key={id}>
              <motion.path d={areaBajo(curva(f, d.ic_bajo, d.ic_alto, 200), d.ic_bajo, d.ic_alto, X, Y)} fill={COLOR[id]} fillOpacity={0.28}
                initial={false} animate={{ opacity: reducir ? 1 : Math.max(0, (k - 0.55) / 0.45) }} transition={{ duration: 0 }}>
                <title>{`${NOMBRE[id]}: el ${nivel} % de la campana está entre ${num(d.ic_bajo, 2)} y ${num(d.ic_alto, 2)}`}</title>
              </motion.path>
              <motion.path d={ruta(pts, X, Y)} fill="none" stroke={COLOR[id]} strokeWidth="3.6" strokeLinejoin="round" pathLength={1}
                style={{ pathLength: reducir ? 1 : Math.min(1, k / 0.6) }} />
              <line x1={X(d.media)} x2={X(d.media)} y1={Y(0)} y2={Y(f(d.media))} stroke={COLOR[id]} strokeWidth="2" strokeDasharray="4 4" />
              <text x={X(d.media)} y={Y(f(d.media)) - 10} textAnchor="middle" fontSize="14" fontWeight="650" fill={COLOR[id]}>
                {NOMBRE[id]}: {num(d.media, 2)}
              </text>
            </g>
          ))}
          <g opacity={reducir ? 1 : Math.max(0, (k - 0.8) / 0.2)}>
            <line x1={X(g.sin_bug.media)} x2={X(g.con_bug.media)} y1={yMedio} y2={yMedio} stroke="var(--ink)" strokeWidth="1.8" markerStart="url(#flecha)" markerEnd="url(#flecha)" />
            <text x={(X(g.sin_bug.media) + X(g.con_bug.media)) / 2} y={yMedio - 9} textAnchor="middle" fontSize="14" fontWeight="650" fill="var(--ink)">
              diferencia = {num(w.pasos.diferencia, 2)}
            </text>
          </g>
          <defs>
            <marker id="flecha" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--ink)" /></marker>
          </defs>
        </Lienzo>
        <div className="mt-2 flex justify-end"><button type="button" className="chip" onClick={reproducir}>Ver la animación otra vez</button></div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="data-table" aria-label="Resumen de cada grupo">
          <thead><tr><th scope="col">Grupo</th><th scope="col">n</th><th scope="col">Media x̄</th><th scope="col">Desviación s</th><th scope="col">Error estándar s/√n</th><th scope="col">gl = n − 1</th><th scope="col">t crítico</th><th scope="col">IC {nivel} % de la media</th></tr></thead>
          <tbody>
            {(['con_bug', 'sin_bug'] as const).map((id) => {
              const d = g[id]
              return (
                <tr key={id}>
                  <td style={{ color: COLOR[id], fontWeight: 650 }}>{NOMBRE[id]}</td><td>{d.n.toLocaleString('es-CO')}</td><td>{num(d.media, 2)}</td><td>{num(d.sd, 2)}</td>
                  <td>{num(d.se, 3)}</td><td>{d.gl.toLocaleString('es-CO')}</td><td>{num(d.t_critico, 4)}</td><td>{num(d.ic_bajo, 2)} a {num(d.ic_alto, 2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ComoLeerla titulo="Qué es cada campana">
          <p>Cada campana responde: <i>«si la media de este grupo se midiera con otra muestra, ¿dónde caería?»</i>. Es una t de Student centrada en la media que calculamos, tan ancha como el <b>error estándar</b> s/√n.</p>
          <p>La zona de color es el <b>intervalo de confianza del {nivel} %</b>: el {nivel} % central del área. Se calcula como x̄ ± t·(s/√n), donde t es el valor crítico de la tabla con n − 1 gl.</p>
        </ComoLeerla>
        <ComoLeerla titulo="Desviación estándar frente a error estándar (no son lo mismo)">
          <p>La <b>desviación estándar s</b> mide qué tan dispersos están los <i>archivos</i> (aquí son enormes: los datos van de 1 a miles). El <b>error estándar s/√n</b> mide qué tan dispersa sería la <i>media</i> entre muestras, y con miles de archivos es pequeñísimo ({num(g.sin_bug.se, 2)} y {num(g.con_bug.se, 2)}).</p>
          <p>Por eso las dos campanas son tan angostas y <b>no se tocan</b>: las medias ({num(g.sin_bug.media, 1)} y {num(g.con_bug.media, 1)}) están separadas por mucho más que su incertidumbre. Eso es lo que la prueba de la siguiente sección convierte en un número.</p>
        </ComoLeerla>
      </div>
    </Panel>
  )
}
