import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { Wallet } from 'xrpl'
import { dataDir } from './paths.ts'

/**
 * Who holds which key. Each process loads only its own role:
 *  - treasury: the operator's account that holds the RLUSD. Its master key never reaches the agent.
 *  - agent:    the agent's hot wallet. Gas XRP only, plus one signer weight on the treasury.
 *  - limits:   the independent limits service's co-signing key.
 *  - operator: the human operator's approval key (weight 2: can approve above-cap payments alone).
 *  - payee-*:  demo payee wallets (in production each payee holds their own).
 */
export type Role = 'treasury' | 'agent' | 'limits' | 'operator' | `payee-${string}`

interface StoredKey {
  role: Role
  address: string
  publicKey: string
  seed: string
}

function envName(role: Role): string {
  return `HARMATTAN_${role.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_SEED`
}

function keyFile(role: Role): string {
  return path.join(dataDir('keys'), `${role}.json`)
}

export function hasWallet(role: Role): boolean {
  return Boolean(process.env[envName(role)]) || existsSync(keyFile(role))
}

export function loadWallet(role: Role): Wallet {
  const fromEnv = process.env[envName(role)]
  if (fromEnv) return Wallet.fromSeed(fromEnv)
  const file = keyFile(role)
  if (!existsSync(file)) {
    throw new Error(`No key for role "${role}". Run \`pnpm setup:testnet\` or set ${envName(role)}.`)
  }
  const stored = JSON.parse(readFileSync(file, 'utf8')) as StoredKey
  return Wallet.fromSeed(stored.seed)
}

export function saveWallet(role: Role, wallet: Wallet): void {
  if (!wallet.seed) throw new Error('Cannot store a wallet without a seed')
  const stored: StoredKey = {
    role,
    address: wallet.classicAddress,
    publicKey: wallet.publicKey,
    seed: wallet.seed,
  }
  const file = keyFile(role)
  writeFileSync(file, JSON.stringify(stored, null, 2) + '\n', { mode: 0o600 })
  chmodSync(file, 0o600)
}

/**
 * Bearer token for the limits service's operator-only routes (policy, approvals). From
 * HARMATTAN_OPERATOR_TOKEN in deployment, else generated once into the git-ignored key folder,
 * where the limits service and the operator's tools on the same machine both read it.
 */
export function operatorToken(): string {
  if (process.env.HARMATTAN_OPERATOR_TOKEN) return process.env.HARMATTAN_OPERATOR_TOKEN
  const file = path.join(dataDir('keys'), 'operator-token')
  if (!existsSync(file)) writeFileSync(file, randomBytes(24).toString('hex') + '\n', { mode: 0o600 })
  return readFileSync(file, 'utf8').trim()
}
