import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="page">
      <div className="container container-narrow">
        <div className="card empty">
          <h1 className="section-title">We could not find that page</h1>
          <p className="muted" style={{ marginBottom: 20 }}>
            The scheme or page you asked for does not exist in the catalogue.
          </p>
          <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
            <Link href="/schemes" className="btn btn-primary">
              Browse all schemes
            </Link>
            <Link href="/assistant" className="btn btn-outline">
              Ask the assistant
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
