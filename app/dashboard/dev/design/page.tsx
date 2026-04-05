import Link from 'next/link';
import { notFound } from 'next/navigation';

const REPO_PATHS = [
  { path: 'app/globals.css', note: 'Board columns, ticket detail, custom .btn-*, .card, forms' },
  { path: 'app/layout.tsx', note: 'Bootstrap + Maxton import order, data-bs-theme, fonts' },
  { path: 'app/dashboard/layout.tsx', note: 'Maxton shell: sidebar, header, main-wrapper' },
  { path: 'components/maxton-top-header.tsx', note: 'Top bar + menu toggle' },
  { path: 'styles/maxton/', note: 'Maxton template CSS (sass + assets)' },
] as const;

/** In-dashboard design lab: dev only, uses real Maxton shell from parent layout. */
export default function DesignLabPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <div className="board-page">
      <header className="d-flex flex-wrap align-items-start justify-content-between gap-3 py-3 px-1 border-bottom bg-body-tertiary rounded-top-4">
        <div>
          <p className="small text-body-secondary mb-1">
            <span className="badge bg-warning text-dark me-2">Dev</span>
            Local only: edit CSS, save, refresh.
          </p>
          <h1 className="h4 text-body mb-0">Design lab</h1>
        </div>
        <Link href="/dashboard" className="btn btn-outline-secondary btn-sm">
          Back to board
        </Link>
      </header>

      <div className="board-page-detail bg-body-secondary bg-opacity-25">
        <div className="mx-auto" style={{ maxWidth: 960 }}>
          <section id="files" className="mb-5">
            <h2 className="h5 text-body-secondary text-uppercase small fw-bold letter-spacing-1 mb-3">
              Where to edit
            </h2>
            <div className="card shadow-sm border-0 rounded-4">
              <ul className="list-group list-group-flush rounded-4">
                {REPO_PATHS.map(({ path, note }) => (
                  <li key={path} className="list-group-item px-4 py-3">
                    <code className="text-primary fw-semibold">{path}</code>
                    <div className="small text-body-secondary mt-1">{note}</div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section id="bootstrap" className="mb-5">
            <h2 className="h5 text-body-secondary text-uppercase small fw-bold letter-spacing-1 mb-3">
              Bootstrap (light theme)
            </h2>
            <div className="row g-3">
              <div className="col-md-6">
                <div className="card border-0 shadow-sm rounded-4 h-100">
                  <div className="card-body">
                    <h3 className="card-title h6">Buttons</h3>
                    <div className="d-flex flex-wrap gap-2 mt-3">
                      <button type="button" className="btn btn-primary">
                        Primary
                      </button>
                      <button type="button" className="btn btn-outline-primary">
                        Outline
                      </button>
                      <button type="button" className="btn btn-success">
                        Success
                      </button>
                      <button type="button" className="btn btn-outline-secondary">
                        Secondary
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="card border-0 shadow-sm rounded-4 h-100">
                  <div className="card-body">
                    <h3 className="card-title h6">Type</h3>
                    <p className="mb-1 fw-semibold">Heading semibold</p>
                    <p className="mb-1 text-body-secondary">Muted body, secondary copy.</p>
                    <p className="small text-muted mb-0">Small muted meta line.</p>
                  </div>
                </div>
              </div>
              <div className="col-12">
                <div className="card border-0 shadow-sm rounded-4">
                  <div className="card-body">
                    <h3 className="card-title h6">Form controls</h3>
                    <div className="row g-3 mt-1">
                      <div className="col-md-6">
                        <label className="form-label small">Text</label>
                        <input type="text" className="form-control" placeholder="Sample input" />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label small">Select</label>
                        <select className="form-select" defaultValue="1">
                          <option value="1">Option A</option>
                          <option value="2">Option B</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="dash-custom" className="mb-5">
            <h2 className="h5 text-body-secondary text-uppercase small fw-bold letter-spacing-1 mb-3">
              Dash custom (globals.css)
            </h2>
            <p className="small text-body-secondary mb-3">
              These classes power tickets and the board. Edit in <code>app/globals.css</code>.
            </p>
            <div className="d-flex flex-wrap gap-2 mb-4">
              <button type="button" className="btn btn-toolbar">
                btn-toolbar
              </button>
              <button type="button" className="btn btn-toolbar btn-toolbar-muted">
                btn-toolbar-muted
              </button>
              <button type="button" className="btn btn-done">
                btn-done
              </button>
              <button type="button" className="btn btn-lost">
                btn-lost
              </button>
            </div>
            <div className="board-toast board-toast-ok d-inline-block me-2">board-toast-ok</div>
            <div className="board-toast board-toast-error d-inline-block">board-toast-error</div>
            <div className="mt-4">
              <span className="badge">badge</span>
            </div>
          </section>

          <section id="board" className="mb-5">
            <h2 className="h5 text-body-secondary text-uppercase small fw-bold letter-spacing-1 mb-3">
              Board preview
            </h2>
            <div className="d-flex gap-3 overflow-auto pb-2">
              <section className="board-list" style={{ width: 260, minHeight: 200 }}>
                <div className="board-list-head">
                  <h2 className="board-list-title">Column</h2>
                  <span className="board-list-count">2</span>
                </div>
                <div className="board-list-body">
                  <article className="card">
                    <div className="fw-semibold">Sample job</div>
                    <p className="meta mb-0">Ticket card in a list</p>
                  </article>
                  <article className="card">
                    <div className="fw-semibold">Another</div>
                    <p className="meta mb-0">Hover / border from .card</p>
                  </article>
                </div>
                <div className="board-list-footer">
                  <button type="button" className="board-list-add" disabled>
                    Add (sample)
                  </button>
                </div>
              </section>
            </div>
          </section>

          <section id="ticket" className="mb-5">
            <h2 className="h5 text-body-secondary text-uppercase small fw-bold letter-spacing-1 mb-3">
              Ticket detail panels
            </h2>
            <div className="ticket-detail-panel">
              <h3 className="detail-section-title">Section title</h3>
              <p className="mb-3">Panel body, same pattern as job / estimate pages.</p>
              <dl className="detail-kv">
                <dt>Label</dt>
                <dd>Value</dd>
                <dt>Mono</dt>
                <dd className="detail-mono">EST-1288 / QBO</dd>
              </dl>
            </div>
          </section>

          <section id="sandbox" className="mb-4">
            <h2 className="h5 text-body-secondary text-uppercase small fw-bold letter-spacing-1 mb-3">
              Browser sandbox
            </h2>
            <div
              id="design-sandbox"
              className="border border-2 border-dashed rounded-4 p-4 bg-white"
              style={{ minHeight: 120 }}
            >
              <p className="text-body-secondary small mb-0">
                Use DevTools, Elements: select this box, try inline styles or classes. For real changes,
                edit <code>app/globals.css</code> (or <code>styles/maxton/</code>) and
                refresh.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
