import type { Table2x2 as Table2x2Counts } from '../state/types'

/** Frecuencias esperadas si C y D fueran independientes: E = (total de fila × total de columna) / n. */
export function expectedOf(t: Table2x2Counts): number[][] {
  const rC = t.C_D + t.C_ND, rN = t.NC_D + t.NC_ND, cD = t.C_D + t.NC_D, cN = t.C_ND + t.NC_ND, n = rC + rN
  return [[(rC * cD) / n, (rC * cN) / n], [(rN * cD) / n, (rN * cN) / n]]
}
