'use client';

export function MaxtonTopHeader() {
  return (
    <header className="top-header">
      <nav className="navbar navbar-expand w-100 align-items-center gap-4">
        <div className="btn-toggle">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              document.body.classList.toggle('toggled');
            }}
            aria-label="Toggle sidebar"
          >
            <i className="material-icons-outlined">menu</i>
          </a>
        </div>
        <div className="search-bar flex-grow-1 d-none d-md-block" aria-hidden />
        <div className="ms-auto text-body-secondary small">Dash / Operations</div>
      </nav>
    </header>
  );
}
