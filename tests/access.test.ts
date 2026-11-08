import { afterEach, describe, expect, it, vi } from 'vitest'
import { basicAuthMatches, isOperator, OPERATOR_COOKIE, operatorCookieValue, publicDemo } from '../operator/lib/access.ts'
import { demoApproveRefusal, demoRunRefusal, maskPhone } from '../operator/lib/demo-rules.ts'
import type { DemoStatus } from '../operator/lib/types.ts'

const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`

afterEach(() => vi.unstubAllEnvs())

describe('operator access', () => {
  it('treats everyone as the operator when no password is set (local use)', async () => {
    vi.stubEnv('HARMATTAN_DASHBOARD_PASSWORD', '')
    expect(await isOperator(new Headers())).toBe(true)
    expect(publicDemo()).toBe(false)
  })

  it('accepts the password with any user name, and nothing else', async () => {
    vi.stubEnv('HARMATTAN_DASHBOARD_PASSWORD', 'tide-pool-7')
    expect(basicAuthMatches(basic('operator', 'tide-pool-7'), 'tide-pool-7')).toBe(true)
    expect(basicAuthMatches(basic('anyone', 'tide-pool-7'), 'tide-pool-7')).toBe(true)
    expect(basicAuthMatches(basic('operator', 'tide-pool-8'), 'tide-pool-7')).toBe(false)
    expect(basicAuthMatches('Bearer tide-pool-7', 'tide-pool-7')).toBe(false)
    expect(basicAuthMatches('Basic %%%', 'tide-pool-7')).toBe(false)
    expect(await isOperator(new Headers({ authorization: basic('x', 'tide-pool-7') }))).toBe(true)
    expect(await isOperator(new Headers())).toBe(false)
  })

  it('accepts the sign-in cookie, which holds a hash and not the password', async () => {
    vi.stubEnv('HARMATTAN_DASHBOARD_PASSWORD', 'tide-pool-7')
    const value = await operatorCookieValue('tide-pool-7')
    expect(value).not.toContain('tide-pool-7')
    expect(await isOperator(new Headers({ cookie: `theme=dark; ${OPERATOR_COOKIE}=${value}` }))).toBe(true)
    expect(await isOperator(new Headers({ cookie: `${OPERATOR_COOKIE}=${await operatorCookieValue('guess')}` }))).toBe(false)
    expect(await isOperator(new Headers({ cookie: `${OPERATOR_COOKIE}=tide-pool-7` }))).toBe(false)
  })

  it('turns the public demo on only with a password and the flag', () => {
    vi.stubEnv('HARMATTAN_PUBLIC_DEMO', '1')
    vi.stubEnv('HARMATTAN_DASHBOARD_PASSWORD', '')
    expect(publicDemo()).toBe(false)
    vi.stubEnv('HARMATTAN_DASHBOARD_PASSWORD', 'tide-pool-7')
    expect(publicDemo()).toBe(true)
    vi.stubEnv('HARMATTAN_PUBLIC_DEMO', '0')
    expect(publicDemo()).toBe(false)
  })
})

describe('public demo limits', () => {
  const status = (patch: Partial<DemoStatus> = {}): DemoStatus => ({
    approvalMaxCents: 4000,
    dailyCents: 12300,
    paidTodayCents: 0,
    runsLeft: 40,
    timezone: 'Africa/Lagos',
    ...patch,
  })

  it('lets a visitor run the agent until the treasury has paid the daily limit', () => {
    expect(demoRunRefusal(status())).toBeNull()
    expect(demoRunRefusal(status({ paidTodayCents: 12299 }))).toBeNull()
    expect(demoRunRefusal(status({ paidTodayCents: 12300 }))).toMatch(/daily limit of 123\.00 RLUSD/)
    expect(demoRunRefusal(status({ runsLeft: 0 }))).toMatch(/agent runs/)
    expect(demoRunRefusal(status({ paidTodayCents: null }))).toMatch(/could not read/)
  })

  it('lets a visitor approve the 40 RLUSD demo payment, not more', () => {
    expect(demoApproveRefusal(status({ paidTodayCents: 2150 }), 4000)).toBeNull()
    expect(demoApproveRefusal(status(), 4001)).toMatch(/up to 40\.00 RLUSD/)
    expect(demoApproveRefusal(status({ paidTodayCents: 8301 }), 4000)).toMatch(/past its daily limit/)
    expect(demoApproveRefusal(status({ paidTodayCents: 8300 }), 4000)).toBeNull()
    expect(demoApproveRefusal(status({ paidTodayCents: null }), 1000)).toMatch(/could not read/)
  })

  it('hides phone numbers from visitors', () => {
    expect(maskPhone('+254712345678')).toBe('+254 ••• 78')
    expect(maskPhone(null)).toBeNull()
    expect(maskPhone(undefined)).toBeNull()
  })
})
