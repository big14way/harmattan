'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { hueOf, initials, type Tone } from '@/lib/format'

const ICONS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  external: 'M9 6h9v9M18 6L7 17',
  download: 'M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14',
  pause: 'M9 6v12M15 6v12',
  play: 'M8 5.5v13l10.5-6.5z',
  sun: 'M12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M19.5 14.5A8 8 0 019.5 4.5a8 8 0 1010 10z',
  key: 'M7.5 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM11 12h9.5M17 12v3M20.5 12v3.5',
  shield: 'M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z',
  chevron: 'M9 6l6 6-6 6',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5',
  clock: 'M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM12 7.5V12l3 2',
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  )
}

/** Harmattan mark: a low sun seen through the dry-season haze. Fixed colours in both themes. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <mask id="haze">
          <rect width="32" height="32" fill="#fff" />
          <rect x="0" y="17" width="32" height="2.4" fill="#000" />
          <rect x="0" y="22.4" width="32" height="2.4" fill="#000" />
        </mask>
      </defs>
      <rect width="32" height="32" rx="8" fill="#2a1f0e" />
      <circle cx="16" cy="17" r="9" fill="#e9a23b" mask="url(#haze)" />
    </svg>
  )
}

export function Avatar({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  const h = hueOf(id)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-mono font-normal"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        letterSpacing: '0.04em',
        background: `light-dark(hsl(${h} 38% 90%), hsl(${h} 22% 22%))`,
        color: `light-dark(hsl(${h} 42% 28%), hsl(${h} 45% 78%))`,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

/** Generated glyph for addresses and the agent (no name to take initials from). */
export function Glyph({ seed, size = 36 }: { seed: string; size?: number }) {
  const h = hueOf(seed)
  const cells = Array.from({ length: 9 }, (_, i) => (hueOf(seed + i) % 3 === 0 ? 1 : 0))
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `light-dark(hsl(${h} 12% 92%), hsl(${h} 8% 22%))` }}
      aria-hidden
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 3 3">
        {cells.map((on, i) =>
          on || i === 4 ? <circle key={i} cx={(i % 3) + 0.5} cy={Math.floor(i / 3) + 0.5} r={0.28} fill={`light-dark(hsl(${h} 25% 25%), hsl(${h} 25% 80%))`} /> : null,
        )}
      </svg>
    </span>
  )
}

const TONE_CLASS: Record<Tone, string> = {
  good: 'bg-good-bg text-good',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  neutral: 'bg-neutral-bg text-muted',
}

export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-normal leading-[18px] ${TONE_CLASS[tone]}`}>{children}</span>
}

export function ToneIcon({ tone }: { tone: Tone }) {
  const cls = { good: 'bg-good-bg text-good', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad', neutral: 'bg-neutral-bg text-muted' }[tone]
  return (
    <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full ${cls}`}>
      <Icon name={tone === 'good' ? 'check' : tone === 'neutral' ? 'clock' : 'x'} size={12} />
    </span>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'sm' }

export function Button({ variant = 'secondary', size = 'md', className = '', ...rest }: ButtonProps) {
  const v = {
    primary: 'bg-accent text-accent-ink border-accent hover:bg-accent-hover hover:border-accent-hover',
    secondary: 'bg-surface text-ink border-line hover:border-line-strong',
    ghost: 'bg-transparent text-muted border-transparent hover:text-ink',
    danger: 'bg-bad text-white border-bad hover:opacity-90 dark:text-canvas',
  }[variant]
  const s = size === 'md' ? 'px-4 py-2.5 text-[14px] leading-5' : 'px-3 py-1.5 text-[13px] leading-5'
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[6px] border font-normal transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${v} ${s} ${className}`}
      {...rest}
    />
  )
}

export function SectionHeader({ index, eyebrow, title, lead, right, id }: { index: string; eyebrow: string; title: string; lead?: ReactNode; right?: ReactNode; id: string }) {
  return (
    <div id={id} className="mb-8 flex scroll-mt-24 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="eyebrow">
          {index} · {eyebrow}
        </p>
        <h2 className="mt-3 text-[32px] font-light leading-[1.08] tracking-[-0.025em] text-ink sm:text-[40px]">{title}</h2>
        {lead ? <p className="mt-3 text-[16px] leading-[25px] text-muted sm:text-[18px] sm:leading-[28px]">{lead}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  )
}

export function ExternalLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 underline decoration-line-strong underline-offset-4 hover:decoration-ink ${className}`}>
      {children}
      <Icon name="external" size={12} />
    </a>
  )
}
