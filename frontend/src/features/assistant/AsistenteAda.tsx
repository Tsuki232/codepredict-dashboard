import { Bot, Loader } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type AssistantReply } from '../../lib/api'
import type { AdaTest, InferenceResult } from '../../state/types'
import { Panel } from '../../ui/Panel'
import { SegmentedTabs } from '../../ui/SegmentedTabs'

type Pick = 'welch' | 'sensibilidad' | 'chi' | 'proporciones' | 'bayes'

/** Solo las cifras necesarias de una prueba (el asistente recibe un resultado COMPACTO, nunca datos crudos). */
const compacto = (t: AdaTest) => ({
  test: t.test, statistic: t.statistic, df: t.df, p_value: t.p_value, estimate: t.estimate, effect_size: t.effect_size, ci: t.ci,
  proportions: t.proportions, expected_min: t.expected_min, decision: t.decision,
})

export function payloadFor(pick: Pick, r: InferenceResult): Record<string, unknown> {
  const a = r.meta.alpha
  switch (pick) {
    case 'welch':
      return { ...compacto(r.welch), alpha: a, grupo_con_errores: r.groups.defectuosos, grupo_sin_errores: r.groups.sin_defecto, levene_p: r.welch.assumptions?.levene_p }
    case 'sensibilidad':
      return { alpha: a, welch_sobre_log_de_1_mas_McCC: compacto(r.welch_log), mann_whitney_por_rangos: compacto(r.robust) }
    case 'chi':
      return { ...compacto(r.chi_square), alpha: a, tabla_2x2: r.table2x2 }
    case 'proporciones':
      return { ...compacto(r.two_proportions), alpha: a, p_error_si_compleja: r.probabilities.p_d_given_c, p_error_si_no_compleja: r.probabilities.p_d_given_nc }
    case 'bayes':
      return { P_D: r.bayes.prior, P_D_dado_C: r.bayes.posterior, P_C_dado_D: r.bayes.p_C_given_D, P_C_dado_noD: r.bayes.p_C_given_notD, P_C: r.bayes.p_C, conteos: r.bayes.counts }
  }
}

/**
 * Asistente Ada con modelo de lenguaje, servido desde otro equipo por un túnel. Solo EXPLICA resultados ya calculados:
 * los números salen del motor estadístico, no del modelo. Si el equipo que corre Ada está apagado, el resto del panel sigue igual.
 */
export function AsistenteAda({ res }: { res: InferenceResult }) {
  const [pick, setPick] = useState<Pick>('welch')
  const [estado, setEstado] = useState<{ configured: boolean; reachable: boolean; detail: string } | null>(null)
  const [busy, setBusy] = useState<'explicar' | 'repaso' | null>(null)
  const [reply, setReply] = useState<(AssistantReply & { modo: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  const revisar = () => { api.assistantStatus().then(setEstado).catch(() => setEstado({ configured: false, reachable: false, detail: 'No se pudo consultar el servidor del panel.' })) }
  useEffect(revisar, [])

  const pedir = async (modo: 'explicar' | 'repaso') => {
    setBusy(modo); setError(null); setReply(null)
    try {
      setReply({ ...(await api.assistantExplain(modo, payloadFor(pick, res))), modo })
    } catch (e) {
      setError((e as Error).message)
      revisar()
    } finally {
      setBusy(null)
    }
  }

  const listo = !!estado?.configured && estado.reachable
  return (
    <Panel title="Asistente Ada (modelo de lenguaje)" note="Explica en palabras sencillas el resultado que elijas. No calcula nada: las cifras vienen del motor estadístico.">
      <p className="small mb-3 flex items-center gap-2" role="status">
        <span className="nav-dot" style={{ background: listo ? 'var(--ok)' : 'var(--warn)', margin: 0 }} aria-hidden />
        {estado ? (listo ? 'Asistente disponible.' : estado.detail) : 'Consultando…'}
        {estado && !listo && <button type="button" className="chip" style={{ height: 26 }} onClick={revisar}>Reintentar</button>}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedTabs label="Resultado a explicar" value={pick} onChange={setPick}
          options={[{ value: 'welch', label: 'Welch' }, { value: 'sensibilidad', label: 'Sensibilidad' }, { value: 'chi', label: 'χ²' }, { value: 'proporciones', label: 'Proporciones' }, { value: 'bayes', label: 'Bayes' }]} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="chip" disabled={!listo || busy !== null} style={{ height: 38, paddingInline: 16 }} onClick={() => void pedir('explicar')}>
          {busy === 'explicar' ? <Loader size={15} className="nb-spin mr-2" aria-hidden /> : <Bot size={15} aria-hidden className="mr-2" />} Explicar con palabras sencillas
        </button>
        <button type="button" className="chip" disabled={!listo || busy !== null} style={{ height: 38, paddingInline: 16 }} onClick={() => void pedir('repaso')}>
          {busy === 'repaso' ? <Loader size={15} className="nb-spin mr-2" aria-hidden /> : null} Preguntas de repaso
        </button>
      </div>
      {busy && <p className="small mt-3" role="status">Ada está pensando… la primera respuesta puede tardar más de un minuto mientras se carga el modelo.</p>}
      {error && <p className="small mt-3" style={{ color: 'var(--bad)' }} role="alert">⚠ {error}</p>}
      {reply && (
        <div className="mt-4">
          <pre className="out" style={{ whiteSpace: 'pre-wrap' }}>{reply.texto}</pre>
          {reply.cifras_no_verificadas.length > 0 && (
            <p className="small mt-2" style={{ color: 'var(--warn)' }}>⚠ Estas cifras del texto NO aparecen en el resultado enviado, así que no las use sin revisarlas: {reply.cifras_no_verificadas.join(', ')}.</p>
          )}
          <p className="small mt-2">Texto generado por IA ({reply.modelo}, {reply.segundos} s). Si lo usan en el informe, deben declarar el uso de IA; la interpretación final es del grupo.</p>
        </div>
      )}
    </Panel>
  )
}
