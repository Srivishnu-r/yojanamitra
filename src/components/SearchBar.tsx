'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'

export default function SearchBar({
  autoFocus = false,
  defaultValue = '',
}: {
  autoFocus?: boolean
  defaultValue?: string
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [value, setValue] = useState(defaultValue)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const query = value.trim()
    router.push(query ? `/schemes?q=${encodeURIComponent(query)}` : '/schemes')
  }

  return (
    <form onSubmit={submit} className="row" style={{ gap: 10, maxWidth: 620 }}>
      <div style={{ position: 'relative', flex: 1 }}>
        <Search
          size={17}
          className="muted"
          style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
          aria-hidden
        />
        <input
          className="input"
          style={{ paddingLeft: 40, height: 46, borderRadius: 'var(--r-pill)' }}
          placeholder={t('search.placeholder')}
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => setValue(event.target.value)}
          aria-label={t('search.placeholder')}
        />
      </div>
      <button type="submit" className="btn btn-primary" style={{ height: 46 }}>
        <Search size={16} />
        Search
      </button>
    </form>
  )
}
