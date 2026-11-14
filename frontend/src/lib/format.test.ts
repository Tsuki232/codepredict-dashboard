import { describe, expect, it } from 'vitest'
import { fmt, fmtInt, fmtP, fmtPct, fmtSig } from './format'

describe('formato de cifras (coma decimal, signo menos tipográfico)', () => {
  it('fmt usa coma y −', () => {
    expect(fmt(27.0297, 2)).toBe('27,03')
    expect(fmt(-0.5, 1)).toBe('−0,5')
    expect(fmt(null)).toBe('—')
    expect(fmt(Number.NaN)).toBe('—')
  })
  it('fmtInt agrupa miles con espacio duro', () => {
    expect(fmtInt(43744)).toBe('43 744')
    expect(fmtInt(32509.4)).toBe('32 509')
    expect(fmtInt(undefined)).toBe('—')
  })
  it('fmtPct', () => {
    expect(fmtPct(0.234, 1)).toBe('23,4 %')
    expect(fmtPct(0.41644, 2)).toBe('41,64 %')
  })
  it('fmtP nunca muestra 0 ni notación de código', () => {
    expect(fmtP(0.01234)).toBe('0,0123')
    expect(fmtP(0.5)).toBe('0,500')
    expect(fmtP(1.57e-148)).toBe('1,57 × 10⁻¹⁴⁸')
    expect(fmtP(0)).toBe('< 10⁻³⁰⁰')
    expect(fmtP(Number.NaN)).toBe('—')
  })
  it('fmtSig', () => {
    expect(fmtSig(26.3614)).toBe('26,36')
    expect(fmtSig(132281097.5, 4)).toBe('1,323 × 10⁸')
    expect(fmtSig(0)).toBe('0')
  })
})
