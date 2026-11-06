import { Client } from 'xrpl'
import { network } from './config.ts'

let shared: Client | null = null
let connecting: Promise<Client> | null = null

/** One shared WebSocket connection per process, reconnecting if it dropped. */
export async function getClient(): Promise<Client> {
  if (shared?.isConnected()) return shared
  if (connecting) return connecting
  connecting = (async () => {
    const client = new Client(network().wss, { connectionTimeout: 15_000 })
    await client.connect()
    shared = client
    return client
  })()
  try {
    return await connecting
  } finally {
    connecting = null
  }
}

export async function disconnect(): Promise<void> {
  if (shared?.isConnected()) await shared.disconnect()
  shared = null
}
