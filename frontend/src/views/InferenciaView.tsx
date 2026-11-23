import { Loader } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SeccionCampana } from '../features/tstudent/SeccionCampana'
import { SeccionMedias } from '../features/tstudent/SeccionMedias'
import { SeccionNeurona } from '../features/tstudent/SeccionNeurona'
import { SeccionPermutacion } from '../features/tstudent/SeccionPermutacion'
import { SeccionPrueba } from '../features/tstudent/SeccionPrueba'
import type { TWelch } from '../features/tstudent/tipos'
import { api } from '../lib/api'
import { fmt, fmtP } from '../lib/format'
import { useStore } from '../state/store'
import { Panel } from '../ui/Panel'
import { SegmentedTabs } from '../ui/SegmentedTabs'
import { Verified } from '../ui/Verified'

/**
 * Inferencia con la t de Student, hecha para exponerla: cada gráfica es una campana continua explicada, la prueba va paso a paso con los números reales,
 * una segunda vía la comprueba sin fórmulas y una neurona predice. Todo se calcula en este equipo con Python: aquí NO interviene Ada ni ninguna IA.
 */
export function InferenciaView() {
  const applied = useStore((s) => s.applied)
  const alpha = useStore((s) => s.alpha)
  const alt = useStore((s) => s.alternative)
  const setAlpha = useStore((s) => s.setAlpha)
  const setAlt = useStore((s) => s.setAlternative)
  const setView = useStore((s) => s.setView)
  const [w, setW] = useState<TWelch | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sha = applied?.output.sha256

  useEffect(() => {
    if (!sha) return
    let vivo = true
    setBusy(true); setErr(null)
    api.tstudent(alpha, alt).then((d) => { if (vivo) setW(d) }).catch((e: Error) => { if (vivo) setErr(e.message) }).finally(() => { if (vivo) setBusy(false) })
    return () => { vivo = false }
  }, [sha, alpha, alt])

  if (!applied) {
    return (
      <div className="flex max-w-[760px] flex-col gap-6">
        <p className="lead">La inferencia se calcula sobre el conjunto limpio y guardado.</p>
        <Panel title="Primero hay que limpiar" note="Así cada resultado queda atado a una huella SHA-256 y a las reglas que lo produjeron.">
          <button type="button" className="chip" style={{ height: 40, paddingInline: 18 }} onClick={() => setView('limpieza')}>Ir a la limpieza</button>
        </Panel>
      </div>
    )
  }

  const g = w?.grupos
  const lado = w ? (w.grupos.con_bug.media > w.grupos.sin_bug.media ? 'mayor' : 'menor') : ''
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-5">
          <div>
            <p className="label mb-1">Nivel de significancia α</p>
            <SegmentedTabs label="Nivel de significancia" value={String(alpha)} onChange={(v) => setAlpha(Number(v))}
              options={[{ value: '0.1', label: '0,10' }, { value: '0.05', label: '0,05' }, { value: '0.01', label: '0,01' }]} />
          </div>
          <div>
            <p className="label mb-1">Hipótesis alternativa (μ₁: con bug · μ₂: sin bug)</p>
            <SegmentedTabs label="Hipótesis alternativa" value={alt} onChange={setAlt}
              options={[{ value: 'two-sided', label: 'Distintas (≠)' }, { value: 'greater', label: 'Con bug mayor (>)' }, { value: 'less', label: 'Con bug menor (<)' }]} />
          </div>
        </div>
        <p className="small flex items-center gap-2" role="status">
          {busy ? <><Loader size={14} className="animate-spin" aria-hidden /> Calculando…</> : w ? 'Calculado en este equipo con Python, sin Ada ni ninguna IA.' : ''}
        </p>
      </div>

      {err && <Panel title="No se pudo calcular" note={err}><p className="small">Revisa que el conjunto limpio esté guardado (vista Limpieza).</p></Panel>}

      {w && g && (
        <div className="flex flex-col gap-6" style={{ opacity: busy ? 0.6 : 1, transition: 'opacity var(--t) var(--ease)' }}>
          <h2 className="lead max-w-[46ch]" aria-live="polite">
            Los archivos con bug tienen una complejidad media de {fmt(g.con_bug.media, 1)} frente a {fmt(g.sin_bug.media, 1)} en los demás
            (diferencia {fmt(w.pasos.diferencia, 1)}; IC {Math.round(w.ic_diferencia.nivel * 100)} % de {fmt(w.ic_diferencia.bajo, 1)} a {fmt(w.ic_diferencia.alto, 1)}).
          </h2>
          <p className="max-w-[78ch]">
            La prueba t de Welch da <b>t = {fmt(w.t, 2)}</b> con {Math.round(w.gl).toLocaleString('es-CO')} grados de libertad y <b>valor p = {fmtP(w.p)}</b>:
            {w.rechaza ? ` se rechaza H₀ (con α = ${fmt(w.alpha, 2)}).` : ` no se rechaza H₀ (con α = ${fmt(w.alpha, 2)}).`} El efecto es {w.efecto.valor < 0.5 ? 'pequeño' : 'importante'} (g de Hedges = {fmt(w.efecto.valor, 2)}),
            y es una <b>asociación</b>, no una causa: la complejidad {lado} acompaña a los bugs, no los provoca.
          </p>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Verified ok={w.verificacion.coincide} label="Fórmula a mano = SciPy" methods={['fórmula manual', 'scipy.stats.ttest_ind']} />
            <span className="small">Conjunto limpio: {w.meta.filas.toLocaleString('es-CO')} archivos · SHA-256 {w.meta.sha256.slice(0, 12)}…</span>
          </p>

          <SeccionCampana glDatos={w.gl} alpha={w.alpha} />
          <SeccionMedias w={w} />
          <SeccionPrueba w={w} />
          <SeccionPermutacion w={w} sha={w.meta.sha256} />
          <SeccionNeurona sha={w.meta.sha256} />

          <Panel title="6. Supuestos y límites (para decirlos en la exposición)" note="Lo que la prueba necesita para ser válida y lo que no puede afirmar.">
            <ul className="small flex list-disc flex-col gap-2 pl-5" style={{ color: 'var(--ink-2)' }}>
              <li><b>Normalidad.</b> La t supone que la media muestral es aproximadamente normal. La complejidad (McCC) es muy asimétrica (unos pocos archivos enormes), pero con miles de archivos por grupo el teorema central del límite hace que la <i>media</i> sí sea casi normal. Con una muestra pequeña esto no valdría.</li>
              <li><b>Independencia.</b> Se supone que cada archivo es una observación independiente. No lo es del todo: varios archivos vienen del mismo proyecto, así que el valor p es optimista. Hay que decirlo.</li>
              <li><b>Varianzas.</b> Welch no las supone iguales (la razón entre ellas es {fmt(w.student_clasica.razon_varianzas, 2)}), por eso se prefiere a la t clásica.</li>
              <li><b>«Significativo» no es «importante».</b> Con {w.meta.filas.toLocaleString('es-CO')} archivos casi cualquier diferencia da p muy pequeño. Se mira el tamaño del efecto (g = {fmt(w.efecto.valor, 2)}) y el intervalo de confianza.</li>
              <li><b>Asociación, no causa.</b> Los archivos más complejos tienen más bugs, pero también suelen ser más grandes; no se probó que la complejidad los cause.</li>
              <li><b>Los datos.</b> Son del Unified Bug Dataset (Ferenc et al., 2020), nivel archivo, código Java anterior a la IA generativa. No son código generado por IA.</li>
            </ul>
          </Panel>
        </div>
      )}
    </div>
  )
}
