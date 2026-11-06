import { network } from './config.ts'

export function txUrl(hash: string): string {
  return `${network().explorer}/transactions/${hash}`
}

export function accountUrl(address: string): string {
  return `${network().explorer}/accounts/${address}`
}
