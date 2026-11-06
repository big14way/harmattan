import { describe, expect, it } from 'vitest'
import { formatMoney, fromCents, toCents } from '../ledger/src/money.ts'

describe('money', () => {
  it('round-trips decimal strings through integer cents', () => {
    for (const s of ['0.01', '2.5', '120', '120.05', '999999.99']) expect(toCents(fromCents(toCents(s)))).toBe(toCents(s))
    expect(toCents('2.5')).toBe(250)
    expect(fromCents(250)).toBe('2.50')
    expect(fromCents(30000)).toBe('300')
  })

  it('rejects ambiguous amounts', () => {
    for (const bad of ['', '1.005', '-1', '1e3', 'abc', '1,000']) expect(() => toCents(bad)).toThrow()
  })

  it('formats for people', () => {
    expect(formatMoney(150000)).toBe('1,500.00 RLUSD')
  })
})
