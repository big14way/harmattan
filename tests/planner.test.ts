import { describe, expect, it } from 'vitest'
import { parseInstruction } from '../agent/src/planner.ts'

describe('parseInstruction', () => {
  it('reads a full XRPL address, digits included', () => {
    expect(parseInstruction('pay 2,000 to rGDDoDLbeUJGv7r4ZJqLwDXCEgsKc8YsVL now')).toEqual({ amount: '2000', payee: 'rGDDoDLbeUJGv7r4ZJqLwDXCEgsKc8YsVL' })
  })
  it('reads a payee id and decimals', () => {
    expect(parseInstruction('Pay 200.50 RLUSD to wanjiru today')).toEqual({ amount: '200.50', payee: 'wanjiru' })
  })
  it('ignores a plain schedule run', () => {
    expect(parseInstruction('Run the scheduled payout for today.')).toBeNull()
  })
})
