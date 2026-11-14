import { create } from 'zustand'
import { DEFAULT_VIEW, VIEW_IDS, type ViewId } from '../app.config'
import { api } from '../lib/api'
import type { Health, InferenceResult, Manifest, Preview, Profile, Rules } from './types'

const viewFromHash = (): ViewId => {
  const h = window.location.hash.replace(/^#\/?/, '') as ViewId
  return VIEW_IDS.includes(h) ? h : DEFAULT_VIEW
}

/** Tema guardado; si no hay, el del sistema. */
function initialTheme(): 'dark' | 'light' {
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light') return saved
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch { /* sin almacenamiento */ }
  return 'light'
}

/** Reglas de partida: las mismas que el servidor (se reemplazan por las suyas al arrancar). */
const FALLBACK_RULES: Rules = {
  integrity: true, drop_exact_duplicates: true, path_policy: 'keep_first', drop_constant_columns: true,
  outlier_policy: 'keep', mccc_threshold: 10, bug_threshold: 0,
}

export const sameRules = (a: Rules, b: Rules) => JSON.stringify(a) === JSON.stringify(b)

let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
let initPromise: Promise<void> | null = null
let hashBound = false

type Alternative = 'two-sided' | 'greater' | 'less'

interface State {
  theme: 'dark' | 'light'
  view: ViewId
  health: Health | null
  serverError: string | null
  booting: boolean

  profile: Profile | null
  profileError: string | null

  rules: Rules
  preview: Preview | null
  previewBusy: boolean
  previewError: string | null

  applied: Manifest | null
  applying: boolean
  applyError: string | null

  alpha: number
  alternative: Alternative
  inference: InferenceResult | null
  inferenceBusy: boolean
  inferenceError: string | null

  setTheme: (t: 'dark' | 'light') => void
  setView: (v: ViewId) => void
  init: () => Promise<void>
  patchRules: (p: Partial<Rules>) => void
  applyRules: () => Promise<void>
  setAlpha: (a: number) => void
  setAlternative: (a: Alternative) => void
  runInference: () => Promise<void>
}

export const useStore = create<State>((set, get) => {
  const refreshPreview = async () => {
    const id = ++seq
    set({ previewBusy: true })
    try {
      const preview = await api.preview(get().rules)
      if (id === seq) set({ preview, previewBusy: false, previewError: null })
    } catch (e) {
      if (id === seq) set({ previewBusy: false, previewError: (e as Error).message })
    }
  }

  return {
    theme: initialTheme(), view: viewFromHash(), health: null, serverError: null, booting: true,
    profile: null, profileError: null,
    rules: FALLBACK_RULES, preview: null, previewBusy: false, previewError: null,
    applied: null, applying: false, applyError: null,
    alpha: 0.05, alternative: 'two-sided', inference: null, inferenceBusy: false, inferenceError: null,

    setTheme: (theme) => {
      document.documentElement.dataset.theme = theme
      try { localStorage.setItem('theme', theme) } catch { /* sin almacenamiento */ }
      set({ theme })
    },
    setView: (view) => {
      if (window.location.hash !== `#/${view}`) window.location.hash = `/${view}`
      set({ view })
    },

    init: () => {
      if (initPromise) return initPromise // StrictMode monta dos veces: solo se inicia una
      initPromise = (async () => {
        document.documentElement.dataset.theme = get().theme
        if (!hashBound) {
          hashBound = true
          window.addEventListener('hashchange', () => set({ view: viewFromHash() }))
        }
        try {
          const health = await api.health()
          set({ health, serverError: null })
        } catch (e) {
          set({ serverError: (e as Error).message, booting: false })
          return
        }
        // Todo lo demás se pide en paralelo; cada parte falla por separado y lo dice.
        const [prof, defaults, status] = await Promise.allSettled([api.profile(), api.defaults(), api.status()])
        if (prof.status === 'fulfilled') set({ profile: prof.value }); else set({ profileError: (prof.reason as Error).message })
        if (defaults.status === 'fulfilled') set({ rules: defaults.value })
        if (status.status === 'fulfilled' && status.value.manifest) {
          // Si ya había una limpieza guardada, las reglas de la pantalla parten de ellas.
          set({ applied: status.value.manifest, rules: status.value.manifest.rules })
        }
        set({ booting: false })
        void refreshPreview()
        // Ada tarda en cargar la primera vez: se sigue preguntando hasta que esté lista (o falle).
        const poll = async () => {
          try {
            const h = await api.health()
            set({ health: h })
            if (h.ada.phase === 'loading' || h.ada.phase === 'idle') setTimeout(poll, 1500)
          } catch { /* el servidor se cayó: la interfaz lo mostrará en la próxima petición */ }
        }
        void poll()
      })()
      return initPromise
    },

    // Cada cambio de regla recalcula la vista previa (agrupando cambios rápidos 150 ms).
    patchRules: (p) => {
      set((s) => ({ rules: { ...s.rules, ...p } }))
      clearTimeout(timer)
      timer = setTimeout(() => void refreshPreview(), 150)
    },

    applyRules: async () => {
      set({ applying: true, applyError: null })
      try {
        const applied = await api.apply(get().rules)
        set({ applied, applying: false, inference: null, inferenceError: null })
      } catch (e) {
        set({ applying: false, applyError: (e as Error).message })
      }
    },

    setAlpha: (alpha) => set({ alpha }),
    setAlternative: (alternative) => set({ alternative }),

    runInference: async () => {
      set({ inferenceBusy: true, inferenceError: null })
      try {
        const { alpha, alternative } = get()
        const inference = await api.inference(alpha, alternative)
        set({ inference, inferenceBusy: false })
      } catch (e) {
        set({ inferenceBusy: false, inferenceError: (e as Error).message })
      }
    },
  }
})
