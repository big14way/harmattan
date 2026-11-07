/**
 * Payment receipts over WhatsApp (Twilio's WhatsApp sandbox when configured).
 *
 * With TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM set, receipts are sent to the
 * payee's WhatsApp number (from the payee directory) and to HARMATTAN_OPERATOR_WHATSAPP. Without
 * them nothing leaves the machine: each receipt is written to the outbox with status "logged", so
 * the demo runs with zero credentials and the dashboard still shows what would have been sent.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { dataDir } from '../../ledger/src/paths.ts'
import { formatMoney } from '../../ledger/src/money.ts'

export interface ReceiptInput {
  paymentId: string
  payeeId: string | null
  payeeName: string
  payeePhone?: string
  cents: number
  memo?: string
  txHash: string
  explorerUrl: string
  approvedBy: 'limits' | 'operator'
}

export interface ReceiptRecord {
  id: string
  at: string
  paymentId: string
  payeeId: string | null
  audience: 'payee' | 'operator'
  to: string | null
  body: string
  status: 'sent' | 'logged' | 'failed'
  detail?: string
}

function outbox(): string {
  return path.join(dataDir('receipts'), 'outbox.jsonl')
}

export function readReceipts(limit = 50): ReceiptRecord[] {
  if (!existsSync(outbox())) return []
  return readFileSync(outbox(), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as ReceiptRecord).slice(-limit).reverse()
}

export function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM)
}

export function receiptBodies(r: ReceiptInput): { payee: string; operator: string } {
  const amount = formatMoney(r.cents)
  const company = process.env.HARMATTAN_COMPANY_NAME
  const forLine = r.memo ? `\nFor: ${r.memo}` : ''
  const payeePage = process.env.HARMATTAN_PUBLIC_URL ? `\nYour payments: ${process.env.HARMATTAN_PUBLIC_URL.replace(/\/$/, '')}/p/${r.payeeId ?? ''}` : ''
  return {
    payee: `Harmattan receipt\nYou received ${amount}${company ? ` from ${company}` : ''}.${forLine}\nXRP Ledger transaction: ${r.explorerUrl}${payeePage}`,
    operator: `Harmattan: paid ${amount} to ${r.payeeName}${r.approvedBy === 'operator' ? ' with your approval' : ' inside your limits'}.${forLine}\n${r.explorerUrl}`,
  }
}

async function sendWhatsApp(to: string, body: string): Promise<{ ok: boolean; detail: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID!
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: process.env.TWILIO_WHATSAPP_FROM!, To: `whatsapp:${to}`, Body: body }),
  })
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string }
  return res.ok ? { ok: true, detail: json.sid ?? 'sent' } : { ok: false, detail: json.message ?? `Twilio ${res.status}` }
}

/** Sends (or logs) the payee's and the operator's receipt for one validated payment. Never throws. */
export async function sendPaymentReceipts(r: ReceiptInput): Promise<ReceiptRecord[]> {
  const bodies = receiptBodies(r)
  const targets: Array<{ audience: 'payee' | 'operator'; to: string | null; body: string }> = [
    { audience: 'payee', to: r.payeePhone ?? null, body: bodies.payee },
    { audience: 'operator', to: process.env.HARMATTAN_OPERATOR_WHATSAPP ?? null, body: bodies.operator },
  ]
  const out: ReceiptRecord[] = []
  for (const t of targets) {
    const base = { id: randomUUID().slice(0, 8), at: new Date().toISOString(), paymentId: r.paymentId, payeeId: r.payeeId, audience: t.audience, to: t.to, body: t.body }
    let record: ReceiptRecord
    if (!twilioConfigured() || !t.to) {
      record = { ...base, status: 'logged', detail: !twilioConfigured() ? 'WhatsApp not configured' : 'No WhatsApp number on file' }
    } else {
      try {
        const sent = await sendWhatsApp(t.to, t.body)
        record = { ...base, status: sent.ok ? 'sent' : 'failed', detail: sent.detail }
      } catch (err) {
        record = { ...base, status: 'failed', detail: (err as Error).message }
      }
    }
    appendFileSync(outbox(), JSON.stringify(record) + '\n')
    out.push(record)
  }
  return out
}
