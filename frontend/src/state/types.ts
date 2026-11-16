/** Formas de datos que devuelve la API (backend/app/adapters/api/routes.py). */
export type PathPolicy = 'keep_all' | 'keep_first' | 'drop_all'
export type OutlierPolicy = 'keep' | 'tukey3' | 'p999'

export interface Rules {
  integrity: boolean
  drop_exact_duplicates: boolean
  path_policy: PathPolicy
  drop_constant_columns: boolean
  outlier_policy: OutlierPolicy
  mccc_threshold: number
  bug_threshold: number
}

export interface Table2x2 { C_D: number; C_ND: number; NC_D: number; NC_ND: number }

export interface Step {
  id: string
  label: string
  before: number
  after: number
  removed: number
  detail: Record<string, unknown>
  verified: boolean | null
  methods: string[]
}

export interface HistData { edges: number[]; counts: Record<string, number[]> }

export interface ColumnProfile {
  name: string; kind: string; missing: number; unique: number
  min?: number; q1?: number; median?: number; mean?: number; q3?: number; max?: number; sd?: number; zeros?: number; skew?: number
}

export interface Profile {
  rows: number; columns: number
  column_profile: ColumnProfile[]
  exact_duplicates: number
  unique_paths: number
  rows_with_repeated_path: number
  rows_in_repeated_paths: number
  paths_repeated: number
  repetition_histogram: Record<string, number>
  duplicated_ids: number
  integrity: { faltantes: number; negativos: number; loc_menor_que_lloc: number; loc_no_positivo: number; no_numericos: number }
  constant_columns: string[]
  table2x2_raw: Table2x2
  hist: Record<'McCC' | 'LOC', HistData>
  source: { path: string; sha256: string; bytes: number; name: string }
}

export interface QuickStats {
  n: number; table: Table2x2
  p_d_given_c: number; p_d_given_nc: number; risk_diff: number
  mean_mccc_bug: number | null; mean_mccc_ok: number | null
  welch_t?: number; welch_p?: number
}
export interface ImpactRow extends QuickStats { path_policy: PathPolicy; outlier_policy: OutlierPolicy; selected: boolean }

export interface Preview {
  rules: Rules
  steps: Step[]
  verified: boolean
  rows_in: number; rows_out: number
  dropped_columns: string[]
  table2x2: Table2x2
  quick: QuickStats
  hist: Record<'McCC' | 'LOC', HistData>
  fences: Record<'McCC' | 'LOC', { q1: number; q3: number; tukey3_upper: number; p999_upper: number }>
  impact: ImpactRow[]
}

export interface Manifest {
  created_utc: string
  rules: Rules
  input: { path: string; sha256: string; rows: number }
  output: { path: string; sha256: string; rows: number; columns: string[] }
  steps: Step[]
  dropped_columns: string[]
  table2x2: Table2x2
  audit: { ledger?: string; timestamp_utc?: string; skipped?: string } | null
}

export interface Health {
  status: string
  ada: { phase: 'idle' | 'loading' | 'ready' | 'error'; ready: boolean; error: string | null; load_seconds: number | null; mode?: 'local' | 'remote' | 'python' | null; motor?: 'ada' | 'python'; note?: string | null; root: string | null }
  dataset: { path: string; exists: boolean }
  work_dir: string
}

/** Resultado compacto de una prueba de Ada (o del acompañante robusto del panel). Todo es opcional salvo lo común. */
export interface AdaTest {
  test: string
  statistic: number | null
  df?: number | null
  p_value: number
  alpha?: number
  estimate?: number
  effect_size?: { name: string; value: number; interpretation: string }
  ci?: { level: number; of: string; low: number; high: number }
  decision: string
  verified: boolean
  verification_methods: string[]
  discrepancy?: number | null
  warnings?: string[]
  rationale?: string[]
  n?: number | number[]
  proportions?: number[]
  expected_min?: number
  assumptions?: {
    normality_x?: { shapiro_p: number | null; skew: number | null; ok: boolean }
    normality_y?: { shapiro_p: number | null; skew: number | null; ok: boolean }
    levene_p?: number; equal_variances?: boolean
  } | null
  descriptives?: { x: { mean: number; sd: number; median: number }; y: { mean: number; sd: number; median: number } }
  computed_by?: string
}

export interface GroupStats { n: number; mean: number; sd: number; median: number; q1: number; q3: number; max: number }

export interface InferenceResult {
  meta: { alpha: number; alternative: 'two-sided' | 'greater' | 'less'; rows: number; sha256: string | null; created_utc: string; rules: Rules; ada: Health['ada']; source: string; matches_saved?: boolean }
  groups: { defectuosos: GroupStats; sin_defecto: GroupStats }
  table2x2: Table2x2
  probabilities: { p_d: number; p_c: number; p_d_given_c: number; p_d_given_nc: number; p_c_given_d: number; risk_diff: number; risk_ratio: number | null }
  welch: AdaTest
  welch_log: AdaTest
  robust: AdaTest
  chi_square: AdaTest
  two_proportions: AdaTest
  bayes: {
    posterior: number; prior: number; p_C_given_D: number; p_C_given_notD: number; p_C: number
    formula: string; decision: string; counts: Record<string, number>; verified: boolean; verification_methods: string[]
    discrepancy?: number | null; warnings?: string[]
  }
  independence: { repeated_path_rows: number; note: string }
  hist: HistData
}

/** Cuaderno celda por celda (backend/app/core/notebook.py). */
export interface NbCell { id: string; title: string; about: string; code: string; needs_ada: boolean }
export type NbBlock =
  | { type: 'text'; text: string }
  | { type: 'table'; title: string; columns: string[]; rows: (string | number)[][] }
  | { type: 'step'; step: Step }
export interface NbResult { cell_id: string; execution_count: number; seconds: number; blocks: NbBlock[]; invalidated: string[] }
