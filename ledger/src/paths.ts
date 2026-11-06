import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { network } from './config.ts'

/** Walks up from cwd to the workspace root (the folder holding pnpm-workspace.yaml). */
export function repoRoot(): string {
  let dir = process.cwd()
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return process.cwd()
    dir = parent
  }
}

/** Local, git-ignored state for the selected network: keys, policy store, logs. */
export function dataDir(...parts: string[]): string {
  const base = process.env.HARMATTAN_DATA_DIR ?? path.join(repoRoot(), '.data')
  const dir = path.join(base, network().name, ...parts)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Public deployment record (addresses and setup tx hashes only), committed to the repo. */
export function deploymentPath(): string {
  const dir = path.join(repoRoot(), 'deployments')
  mkdirSync(dir, { recursive: true })
  return path.join(dir, `${network().name}.json`)
}
