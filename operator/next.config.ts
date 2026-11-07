import path from 'node:path'
import type { NextConfig } from 'next'

const root = path.join(import.meta.dirname, '..')

const config: NextConfig = {
  // The dashboard imports the ledger, limits and agent modules from the workspace root.
  turbopack: { root },
  outputFileTracingRoot: root,
  serverExternalPackages: ['xrpl', 'ws', 'ripple-keypairs', 'ripple-binary-codec'],
  poweredByHeader: false,
  agentRules: false,
}

export default config
