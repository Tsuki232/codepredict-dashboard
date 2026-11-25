/** Lo que devuelven /api/tablero (backend/app/core/tablero.py) y /api/ia/comparativa (backend/app/core/ia_comparativa.py). */

export interface TCaja {
  n: number; media: number; sd: number; mediana: number; q1: number; q3: number
  bigote_bajo: number; bigote_alto: number; maximo: number; atipicos: number
}

export interface TTramo {
  tramo: string; desde: number; hasta: number | null
  con_bug: number; sin_bug: number; parte_con_bug: number; parte_sin_bug: number
}

export interface TRiesgo { tramo: string; n: number; con_bug: number; tasa: number; ic95: [number, number] }

export interface TTabla {
  celdas: { C_D: number; C_ND: number; NC_D: number; NC_ND: number }
  n: number
  coincide_manifiesto: boolean
  p_d: number; p_c: number; p_d_dado_c: number; p_d_dado_nc: number
  total_probabilidad: number
  p_c_dado_d: number; p_c_dado_d_directa: number; bayes_coincide: boolean
  razon_de_riesgo: number
  odds_ratio: number; or_ic95: [number, number]
  dependientes: boolean
}

export interface TPaso { id: string; etiqueta: string; antes: number; despues: number; quitadas: number }

export interface TTablero {
  meta: { sha256: string; filas: number; creado: string; umbral_compleja: number; filas_originales: number }
  kpis: { filas: number; con_bug: number; tasa_bug: number; media_mccc: number; mediana_mccc: number; maximo_mccc: number; complejas: number; tasa_compleja: number }
  embudo: TPaso[]
  cajas: { con_bug: TCaja; sin_bug: TCaja }
  histograma: TTramo[]
  riesgo: TRiesgo[]
  tabla: TTabla
  correlacion: { mccc_loc: number | null; mccc_bug: number | null; nota: string }
  nube: { semilla: number; n: number; de: number; puntos: { mccc: number; loc: number; bug: number }[] }
}

// ----------------------------------------------------------------------------- IA frente a personas

export type IaFuenteId = 'human' | 'chatgpt' | 'dsc' | 'qwen'
export interface IaEstadistico { media: number; min: number; max: number; sd: number }
export interface IaTasa { k: number; n: number; tasa: number; ic95: [number, number] }

export interface IaFuente {
  id: IaFuenteId
  nombre: string
  es_persona: boolean
  defectos: IaTasa & { alertas: number; por_muestra_defectuosa: number }
  vulnerabilidades: IaTasa & { problemas: number; cwe_distintos: number }
  complejidad: { funciones: number; CCN: IaEstadistico; NLOC: IaEstadistico; TOKEN_COUNT: IaEstadistico }
  odc: { tipo: string; n: number; parte: number }[]
  top_reglas: { regla: string; n: number }[]
  top_cwe: { cwe: string; nombre: string | null; n: number }[]
  vs_personas: null | {
    defectos: { dif_pp: number; razon: number }
    vulnerabilidades: { dif_pp: number; razon: number }
    ccn: { dif: number; razon: number; d_cohen: number }
    nloc: { razon: number }
  }
}

export interface IaLenguaje {
  id: 'java' | 'python'
  nombre: string
  muestras: number
  repositorios: number
  herramienta_defectos: string
  herramienta_seguridad: string
  fuentes: IaFuente[]
  odc_tipos: string[]
  lectura: { metrica: 'defectos' | 'vulnerabilidades' | 'complejidad'; texto: string }[]
}

export interface TIa {
  meta: { titulo: string; autores: string[]; anio: number; congreso: string; arxiv: string; licencia: string; descargado: string; md5_zip: string; nota: string; zenodo: string; cita: string; fuentes: Record<IaFuenteId, string> }
  limites: string[]
  lenguajes: { java: IaLenguaje; python: IaLenguaje }
}
