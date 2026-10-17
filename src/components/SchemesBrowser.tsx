'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { SlidersHorizontal, Search, X, Loader2 } from 'lucide-react'
import type { EligibilityResult, Scheme } from '@/lib/types'
import { STATE_NAMES } from '@/lib/data/states'
import { SCHEME_CATEGORIES } from '@/lib/types'
import { useI18n } from '@/lib/i18n/context'
import { useSession } from '@/components/SessionProvider'
import SchemeCard from '@/components/SchemeCard'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 12

export default function SchemesBrowser() {
  const params = useSearchParams()
  const router = useRouter()
  const { t } = useI18n()
  const { session } = useSession()

  const [query, setQuery] = useState(params.get('q') ?? '')
  const [state, setState] = useState(params.get('state') ?? '')
  const [category, setCategory] = useState(params.get('category') ?? '')
  const [level, setLevel] = useState(params.get('level') ?? '')
  const [onlyEligible, setOnlyEligible] = useState(false)

  const [schemes, setSchemes] = useState<Scheme[]>([])
  const [results, setResults] = useState<Record<string, EligibilityResult>>({})
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(PAGE_SIZE)

  // Seed the state filter from the stored profile the first time round.
  useEffect(() => {
    if (!state && session?.profile.state) setState(session.profile.state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.profile.state])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setVisible(PAGE_SIZE)

    const search = new URLSearchParams()
    if (query) search.set('q', query)
    if (state) search.set('state', state)
    if (category) search.set('category', category)
    if (level) search.set('level', level)
    search.set('limit', '120')

    fetch(`/api/schemes?${search.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { schemes: Scheme[] }) => setSchemes(data.schemes ?? []))
      .catch(() => undefined)
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [query, state, category, level])

  // Eligibility scores are computed for the whole visible set in one call.
  useEffect(() => {
    if (!session || Object.keys(session.profile).length === 0) return
    fetch('/api/eligibility?limit=200')
      .then((res) => res.json())
      .then((data: { matches: Array<{ scheme: Scheme; result: EligibilityResult }> }) => {
        const map: Record<string, EligibilityResult> = {}
        for (const match of data.matches ?? []) map[match.scheme.id] = match.result
        setResults(map)
      })
      .catch(() => undefined)
  }, [session])

  const filtered = useMemo(() => {
    if (!onlyEligible) return schemes
    return schemes.filter((scheme) => {
      const result = results[scheme.id]
      return result && (result.verdict === 'eligible' || result.verdict === 'likely')
    })
  }, [schemes, onlyEligible, results])

  function syncUrl(next: Partial<Record<'q' | 'state' | 'category' | 'level', string>>) {
    const search = new URLSearchParams()
    const merged = { q: query, state, category, level, ...next }
    for (const [key, value] of Object.entries(merged)) {
      if (value) search.set(key, value)
    }
    router.replace(search.toString() ? `/schemes?${search}` : '/schemes', { scroll: false })
  }

  function clearAll() {
    setQuery('')
    setState('')
    setCategory('')
    setLevel('')
    setOnlyEligible(false)
    router.replace('/schemes', { scroll: false })
  }

  const activeFilters = [query, state, category, level].filter(Boolean).length

  return (
    <div className="page">
      <div className="container">
        <span className="eyebrow">Catalogue</span>
        <h1 className="section-title">Government schemes across India</h1>
        <p className="lead" style={{ marginBottom: 24 }}>
          Search central and state schemes. If you have filled in your profile, each card
          shows how well it matches your situation.
        </p>

        {/* ------------------------------ filters ---------------------------- */}
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: 12 }}>
            <div className="field">
              <label className="field-label" htmlFor="scheme-search">
                Search
              </label>
              <div style={{ position: 'relative' }}>
                <Search
                  size={15}
                  className="muted"
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
                <input
                  id="scheme-search"
                  className="input"
                  style={{ paddingLeft: 34 }}
                  placeholder={t('search.placeholder')}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    syncUrl({ q: event.target.value })
                  }}
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="scheme-state">
                State / UT
              </label>
              <select
                id="scheme-state"
                className="select"
                value={state}
                onChange={(event) => {
                  setState(event.target.value)
                  syncUrl({ state: event.target.value })
                }}
              >
                <option value="">All of India</option>
                {STATE_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="scheme-level">
                Level
              </label>
              <select
                id="scheme-level"
                className="select"
                value={level}
                onChange={(event) => {
                  setLevel(event.target.value)
                  syncUrl({ level: event.target.value })
                }}
              >
                <option value="">Central + State</option>
                <option value="central">Central only</option>
                <option value="state">State only</option>
              </select>
            </div>

            <div className="field">
              <span className="field-label">Reset</span>
              <button
                type="button"
                className="btn btn-outline"
                onClick={clearAll}
                disabled={activeFilters === 0 && !onlyEligible}
              >
                <X size={15} /> Clear
              </button>
            </div>
          </div>

          <div className="divider" />

          <div className="row row-wrap" style={{ gap: 8 }}>
            <span className="small muted row" style={{ gap: 6 }}>
              <SlidersHorizontal size={14} /> Category
            </span>
            <button
              type="button"
              className={cn('chip', !category && 'active')}
              onClick={() => {
                setCategory('')
                syncUrl({ category: '' })
              }}
            >
              All
            </button>
            {SCHEME_CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                className={cn('chip', category === item && 'active')}
                onClick={() => {
                  const next = category === item ? '' : item
                  setCategory(next)
                  syncUrl({ category: next })
                }}
              >
                {item}
              </button>
            ))}
          </div>

          {Object.keys(results).length > 0 ? (
            <>
              <div className="divider" />
              <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={onlyEligible}
                  onChange={(event) => setOnlyEligible(event.target.checked)}
                />
                Show only schemes I am eligible for
              </label>
            </>
          ) : null}
        </div>

        {/* ------------------------------ results ---------------------------- */}
        <div className="row-between" style={{ marginBottom: 16 }}>
          <span className="small muted">
            {loading ? 'Searching…' : `${filtered.length} scheme${filtered.length === 1 ? '' : 's'}`}
            {state ? ` · ${state}` : ''}
            {category ? ` · ${category}` : ''}
          </span>
          {loading ? <Loader2 size={16} className="spinner-dark" /> : null}
        </div>

        {loading ? (
          <div className="grid grid-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="skeleton" key={index} style={{ height: 240 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card empty">
            <p className="strong">No schemes matched those filters.</p>
            <p className="small muted">
              Try clearing the category, or search with different words such as
              &ldquo;pension&rdquo;, &ldquo;scholarship&rdquo; or &ldquo;solar&rdquo;.
            </p>
            <button type="button" className="btn btn-outline" onClick={clearAll} style={{ marginTop: 14 }}>
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-3">
              {filtered.slice(0, visible).map((scheme) => (
                <SchemeCard key={scheme.id} scheme={scheme} result={results[scheme.id]} />
              ))}
            </div>

            {visible < filtered.length ? (
              <div style={{ textAlign: 'center', marginTop: 28 }}>
                <button
                  type="button"
                  className="btn btn-outline btn-lg"
                  onClick={() => setVisible((value) => value + PAGE_SIZE)}
                >
                  Show more ({filtered.length - visible} remaining)
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
