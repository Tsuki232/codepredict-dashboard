/** Lo que devuelven las rutas /api/tstudent* (backend/app/core/tstudent.py). Todo calculado en este equipo con Python, sin Ada ni ninguna IA. */
import type { Rules } from '../../state/types'

export type Alternativa = 'two-sided' | 'greater' | 'less'

export interface TGrupo {
  n: number; media: number; sd: number; se: number; gl: number
  t_critico: number; ic_bajo: number; ic_alto: number; mediana: number
}

export interface TWelch {
  alpha: number
  alternativa: Alternativa
  grupos: { con_bug: TGrupo; sin_bug: TGrupo }
  pasos: { diferencia: number; termino_1: number; termino_2: number; error_estandar: number; t: number; gl: number }
  t: number
  gl: number
  p: number
  critico: { bajo: number | null; alto: number | null }
  rechaza: boolean
  ic_diferencia: { bajo: number; alto: number; nivel: number }
  efecto: { nombre: string; valor: number }
  verificacion: { scipy_t: number; scipy_p: number; scipy_gl: number; coincide: boolean; diferencia_t: number }
  student_clasica: { t: number; gl: number; razon_varianzas: number }
  meta: { sha256: string; filas: number; reglas: Rules; creado: string }
}

export interface TPermutacion {
  repeticiones: number
  semilla: number
  t_obs: number
  t_perm: number[]
  extremos: number
  p: number
  p_minimo: number
  media_perm: number
  sd_perm: number
  max_abs_perm: number
}

export interface TNeurona {
  semilla: number
  epocas: number
  tasa_aprendizaje: number
  n_entrenamiento: number
  n_prueba: number
  tasa_base: number
  w: number
  b: number
  media_log: number
  sd_log: number
  formula: { pendiente_log: number; intercepto: number }
  historia: { epoca: number; w: number; b: number; perdida: number }[]
  auc_prueba: number
  auc_entrenamiento: number
  ejemplos: { mccc: number; p: number }[]
  tramos: { desde: number; hasta: number; n: number; observado: number; predicho: number }[]
  verificacion: { w_newton: number; b_newton: number; diferencia_w: number; diferencia_b: number; coincide: boolean }
  /** Curva ROC del 20 % de prueba (hasta 80 puntos para dibujarla) y su área por trapecios, que debe coincidir con `auc_prueba`. */
  roc?: { puntos: { fpr: number; tpr: number }[]; auc_trapecios: number }
  /** Matriz de confusión y métricas al declarar «con bug» cuando la probabilidad llega a 0,5. */
  umbral?: { umbral: number; vp: number; fp: number; fn: number; vn: number; exactitud: number; precision: number | null; sensibilidad: number | null; f1: number | null }
  /** Exactitud de acertar siempre con la clase más común: la vara que debe superar el modelo. */
  regla_trivial?: { exactitud: number }
}
