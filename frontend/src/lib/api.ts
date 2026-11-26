import type { Health, InferenceResult, Manifest, NbCell, NbResult, Preview, Profile, Rules } from '../state/types'
import { announceAdaDown, isAdaDownCode } from './engine'
import type { Alternativa, TNeurona, TPermutacion, TWelch } from '../features/tstudent/tipos'
import type { TIa, TTablero } from '../features/tablero/tipos'

/** Motor elegido (Ada o Python local) y estado de Ada, tal como lo informa el servidor del panel. */
export interface EngineInfo { motor: 'ada' | 'python'; proceso_en_ada_remota: boolean; ada: Health['ada'] }

/** Cabeceras comunes de la API (incluye la clave si se definió VITE_API_KEY). */
export function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  const key = import.meta.env.VITE_API_KEY as string | undefined
  if (key) h['X-API-Key'] = key
  return h
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message) }
}

/** Una celda de la pestaña «Código»: su explicación y el código Python real (o un ejemplo que no se ejecuta). */
export interface CeldaCodigo { id: string; title: string; about: string; code: string; ejemplo: boolean }

async function call<T>(path: string, init?: RequestInit, timeoutMs = 120_000): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...apiHeaders() }, signal: ctl.signal })
    if (!r.ok) {
      let msg = `Error ${r.status}`
      let code: string | undefined
      try { const j = await r.json(); if (typeof j?.detail === 'string') msg = j.detail; if (typeof j?.code === 'string') code = j.code } catch { /* sin cuerpo JSON */ }
      if (isAdaDownCode(code)) announceAdaDown(msg)   // el panel abre el modal: seguir con Python local o reintentar con Ada
      throw new ApiError(r.status, msg, code)
    }
    return (await r.json()) as T
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new ApiError(0, 'La petición tardó demasiado.')
    if (e instanceof ApiError) throw e
    throw new ApiError(0, 'No se pudo conectar con el servidor.')
  } finally {
    clearTimeout(timer)
  }
}

const post = <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const api = {
  health: () => call<Health>('/api/health', undefined, 8000),
  engine: () => call<EngineInfo>('/api/engine', undefined, 8000),
  setEngine: (motor: 'ada' | 'python') => post<EngineInfo>('/api/engine', { motor }),
  profile: () => call<Profile>('/api/dataset/profile'),
  defaults: () => call<Rules>('/api/clean/defaults', undefined, 8000),
  preview: (rules: Rules) => post<Preview>('/api/clean/preview', rules),
  status: () => call<{ applied: boolean; manifest: Manifest | null }>('/api/clean/status', undefined, 8000),
  apply: (rules: Rules) => post<Manifest>('/api/clean/apply', rules),
  // t de Student: calculada en este equipo con Python, sin Ada ni ninguna IA (la permutación y la neurona tardan unos segundos).
  tstudent: (alpha: number, alternativa: Alternativa) => call<TWelch>(`/api/tstudent?alpha=${alpha}&alternativa=${alternativa}`),
  permutacion: (repeticiones: number, semilla: number) => call<TPermutacion>(`/api/tstudent/permutacion?repeticiones=${repeticiones}&semilla=${semilla}`, undefined, 180_000),
  codigoNeurona: () => call<{ cells: CeldaCodigo[] }>('/api/codigo/neurona'),
  neurona: () => call<TNeurona>('/api/tstudent/neurona', undefined, 180_000),
  // Tablero estadístico: cifras descriptivas del conjunto limpio e «IA frente a personas» (resultados agregados de Cotroneo et al., 2025).
  tablero: () => call<TTablero>('/api/tablero', undefined, 60_000),
  iaComparativa: () => call<TIa>('/api/ia/comparativa', undefined, 20_000),
  inference: (alpha: number, alternative: string) => post<InferenceResult>('/api/inference', { alpha, alternative }),
  inferenceLive: (rules: Rules, alpha: number, alternative: string) => post<InferenceResult>('/api/inference/live', { rules, alpha, alternative }),
  nbCells: () => call<{ cells: NbCell[]; done: Record<string, number>; count: number }>('/api/notebook/cells', undefined, 8000),
  nbReset: () => post<{ done: Record<string, number> }>('/api/notebook/reset', {}),
  nbRun: (cell_id: string, rules: Rules, alpha: number, alternative: string) => post<NbResult>('/api/notebook/run', { cell_id, rules, alpha, alternative }),
}

/** Descarga un archivo de la API (respeta la clave, que un enlace simple no enviaría). */
export async function downloadFromApi(url: string, filename: string): Promise<void> {
  const r = await fetch(url, { headers: apiHeaders() })
  if (!r.ok) {
    let msg = `Error ${r.status}`
    try { const j = await r.json(); if (typeof j?.detail === 'string') msg = j.detail } catch { /* sin cuerpo JSON */ }
    throw new ApiError(r.status, msg)
  }
  saveBlob(await r.blob(), filename)
}

/** Guarda un Blob con un nombre dado (enlace temporal). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
