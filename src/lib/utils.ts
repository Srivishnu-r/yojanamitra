/** Small shared helpers. */

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function uid(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10)
  const t = Date.now().toString(36)
  return `${prefix}${prefix ? '_' : ''}${t}${rand}`
}

export function formatINR(amount: number): string {
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatIndianNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value)
}

export function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Never leak a key into a log line or an error message. */
export function maskSecret(secret?: string): string {
  if (!secret) return '(not set)'
  if (secret.length <= 8) return '••••'
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Fetch that fails loudly instead of silently hanging. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number; label?: string } = {},
): Promise<T> {
  const { timeoutMs = 30_000, label = url, ...rest } = init
  const res = await withTimeout(fetch(url, rest), timeoutMs, label)
  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `${label} failed (${res.status}): ${text.slice(0, 400)}`,
    )
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${label} returned non-JSON: ${text.slice(0, 200)}`)
  }
}
