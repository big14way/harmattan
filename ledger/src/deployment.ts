import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { network, stablecoin, type IssuedAsset } from './config.ts'
import { deploymentPath } from './paths.ts'

export interface PayeeRecord {
  id: string
  name: string
  country: string
  city: string
  address: string
}

/** Public record of what was deployed on the network. Addresses and tx hashes only, never keys. */
export interface Deployment {
  network: string
  stablecoin: IssuedAsset
  accounts: {
    treasury?: string
    agent?: string
    limits?: string
    operator?: string
  }
  payees: Record<string, PayeeRecord>
  signerList?: { quorum: number; entries: Array<{ role: string; account: string; weight: number }> }
  txs: Record<string, string>
  probes: Record<string, { result: string; hash?: string; note: string; at: string }>
  updatedAt?: string
}

export function readDeployment(): Deployment {
  const file = deploymentPath()
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as Deployment
  return { network: network().name, stablecoin: stablecoin(), accounts: {}, payees: {}, txs: {}, probes: {} }
}

export function writeDeployment(d: Deployment): void {
  d.updatedAt = new Date().toISOString()
  writeFileSync(deploymentPath(), JSON.stringify(d, null, 2) + '\n')
}

export function updateDeployment(fn: (d: Deployment) => void): Deployment {
  const d = readDeployment()
  fn(d)
  writeDeployment(d)
  return d
}
