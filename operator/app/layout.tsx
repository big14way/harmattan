import type { Metadata } from 'next'
import { Inter_Tight, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const sans = Inter_Tight({ subsets: ['latin'], weight: ['300', '400', '500'], variable: '--font-inter-tight' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['300', '400'], variable: '--font-jetbrains' })

export const metadata: Metadata = {
  title: 'Harmattan · Operator',
  description: 'Limits, approvals and the ledger log for the Harmattan treasury agent.',
  icons: { icon: '/icon.svg' },
}

// Applies the saved theme before first paint, so dark mode never flashes light.
const themeScript = `try{var t=localStorage.getItem('harmattan-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.dataset.theme='dark'}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
