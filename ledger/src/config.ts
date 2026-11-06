export type NetworkName = 'testnet' | 'devnet'

export interface NetworkConfig {
  name: NetworkName
  wss: string
  explorer: string
  faucetHost: string
}

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  testnet: {
    name: 'testnet',
    wss: 'wss://s.altnet.rippletest.net:51233',
    explorer: 'https://testnet.xrpl.org',
    faucetHost: 'faucet.altnet.rippletest.net',
  },
  devnet: {
    name: 'devnet',
    wss: 'wss://s.devnet.rippletest.net:51233',
    explorer: 'https://devnet.xrpl.org',
    faucetHost: 'faucet.devnet.rippletest.net',
  },
}

export function network(): NetworkConfig {
  const name = (process.env.XRPL_NETWORK ?? 'testnet') as NetworkName
  const cfg = NETWORKS[name]
  if (!cfg) throw new Error(`Unknown XRPL_NETWORK "${name}". Use testnet or devnet.`)
  return cfg
}

export interface IssuedAsset {
  symbol: string
  /** 40-char hex currency code as it appears on ledger */
  currency: string
  issuer: string
  /** where the issuer address was taken from */
  source: string
}

/**
 * RLUSD on XRPL Testnet. Issuer and currency code from https://tryrlusd.com/addresses.
 * The issuer has requireDestinationTag and depositAuth set, and allowTrustLineLocking unset,
 * which means RLUSD cannot be locked in a token escrow on testnet.
 */
export const RLUSD_TESTNET: IssuedAsset = {
  symbol: 'RLUSD',
  currency: '524C555344000000000000000000000000000000',
  issuer: 'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV',
  source: 'https://tryrlusd.com/addresses',
}

export function stablecoin(): IssuedAsset {
  const net = network()
  if (net.name !== 'testnet') {
    throw new Error(`RLUSD is only configured for testnet, not ${net.name}.`)
  }
  return RLUSD_TESTNET
}
