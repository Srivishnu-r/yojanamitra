import type { Scheme, SchemeCategory } from '@/lib/types'
import { SCHEME_CATEGORIES } from '@/lib/types'
import { CENTRAL_SCHEMES } from './schemes-central'
import { STATE_SCHEMES } from './schemes-state'

/** The complete catalogue: central + every state and UT. */
export const ALL_SCHEMES: Scheme[] = [...CENTRAL_SCHEMES, ...STATE_SCHEMES]

// Catch duplicate ids at module load rather than shipping an ambiguous catalogue.
const seen = new Set<string>()
for (const scheme of ALL_SCHEMES) {
  if (seen.has(scheme.id)) {
    throw new Error(`Duplicate scheme id in catalogue: ${scheme.id}`)
  }
  seen.add(scheme.id)
}

const SCHEME_INDEX: Record<string, Scheme> = Object.fromEntries(
  ALL_SCHEMES.map((s) => [s.id, s]),
)

export function getScheme(id: string): Scheme | undefined {
  return SCHEME_INDEX[id]
}

export function requireScheme(id: string): Scheme {
  const scheme = SCHEME_INDEX[id]
  if (!scheme) throw new Error(`Unknown scheme: ${id}`)
  return scheme
}

export interface SchemeQuery {
  text?: string
  state?: string
  category?: SchemeCategory
  level?: 'central' | 'state'
  /** Only schemes the citizen can use regardless of their state. */
  includeCentral?: boolean
  limit?: number
}

/** Normalised token overlap scoring, good enough for a ~70 item catalogue. */
function relevance(scheme: Scheme, terms: string[]): number {
  if (terms.length === 0) return 0
  const haystack = [
    scheme.name,
    scheme.nameHi ?? '',
    scheme.summary,
    scheme.ministry ?? '',
    scheme.state ?? '',
    scheme.tags.join(' '),
    scheme.categories.join(' '),
  ]
    .join(' ')
    .toLowerCase()

  let score = 0
  for (const term of terms) {
    if (!term) continue
    if (scheme.name.toLowerCase().includes(term)) score += 10
    if (scheme.tags.some((t) => t.includes(term))) score += 5
    if (scheme.categories.some((c) => c.toLowerCase().includes(term))) score += 4
    if (scheme.state?.toLowerCase().includes(term)) score += 6
    if (haystack.includes(term)) score += 2
  }
  return score
}

export function searchSchemes(query: SchemeQuery = {}): Scheme[] {
  const {
    text = '',
    state,
    category,
    level,
    includeCentral = true,
    limit = 50,
  } = query

  const terms = text
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097F]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 1)

  let results = ALL_SCHEMES.filter((scheme) => {
    if (level && scheme.level !== level) return false
    if (category && !scheme.categories.includes(category)) return false
    if (state) {
      const isLocal = scheme.level === 'state' && scheme.state === state
      const isCentral = scheme.level === 'central'
      if (!isLocal && !(includeCentral && isCentral)) return false
    }
    return true
  })

  if (terms.length > 0) {
    results = results
      .map((scheme) => ({ scheme, score: relevance(scheme, terms) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.scheme)
  } else {
    results = results.sort(
      (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0),
    )
  }

  return results.slice(0, limit)
}

export interface CatalogueStats {
  total: number
  central: number
  state: number
  statesCovered: number
  categories: number
}

export function catalogueStats(): CatalogueStats {
  const states = new Set(
    ALL_SCHEMES.filter((s) => s.level === 'state' && s.state).map((s) => s.state),
  )
  return {
    total: ALL_SCHEMES.length,
    central: ALL_SCHEMES.filter((s) => s.level === 'central').length,
    state: ALL_SCHEMES.filter((s) => s.level === 'state').length,
    statesCovered: states.size,
    categories: SCHEME_CATEGORIES.length,
  }
}

/** Distinct categories actually used, for filter chips. */
export const USED_CATEGORIES: SchemeCategory[] = SCHEME_CATEGORIES.filter((category) =>
  ALL_SCHEMES.some((s) => s.categories.includes(category)),
)

export { CENTRAL_SCHEMES, STATE_SCHEMES }
