import type { Health, InferenceResult, Manifest, NbCell, NbResult, Preview, Profile, Rules } from '../state/types'

/** Cabeceras comunes de la API (incluye la clave si se definió VITE_API_KEY). */
export function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  const key = import.meta.env.VITE_API_KEY as string | undefined
  if (key) h['X-API-Key'] = key
  return h
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 120_000): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...apiHeaders() }, signal: ctl.signal })
    if (!r.ok) {
      let msg = `Error ${r.status}`
      try { const j = await r.json(); if (typeof j?.detail === 'string') msg = j.detail } catch { /* sin cuerpo JSON */ }
      throw new ApiError(r.status, msg)
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
  profile: () => call<Profile>('/api/dataset/profile'),
  defaults: () => call<Rules>('/api/clean/defaults', undefined, 8000),
  preview: (rules: Rules) => post<Preview>('/api/clean/preview', rules),
  status: () => call<{ applied: boolean; manifest: Manifest | null }>('/api/clean/status', undefined, 8000),
  apply: (rules: Rules) => post<Manifest>('/api/clean/apply', rules),
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
