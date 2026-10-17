import { Suspense } from 'react'
import SchemesBrowser from '@/components/SchemesBrowser'

export const metadata = {
  title: 'Scheme catalogue',
  description:
    'Browse central and state government schemes across all 28 states and 8 union territories of India.',
}

export default function SchemesPage() {
  return (
    <Suspense
      fallback={
        <div className="page">
          <div className="container">
            <div className="skeleton" style={{ height: 40, width: 320, marginBottom: 20 }} />
            <div className="grid grid-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div className="skeleton" key={index} style={{ height: 240 }} />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <SchemesBrowser />
    </Suspense>
  )
}
