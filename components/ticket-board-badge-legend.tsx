/** Compact key for estimate / invoice / task / integration badges on board cards. */
export function TicketBoardBadgeLegend() {
  return (
    <aside
      className="board-badge-legend border-top pt-3 mt-2 px-3 px-md-4 pb-3"
      aria-label="Ticket card badge key"
    >
      <h3 className="h6 fw-semibold mb-2 text-body">Card badges</h3>
      <ul className="list-unstyled small text-body-secondary d-flex flex-wrap column-gap-4 row-gap-2 mb-0">
        <li className="d-flex align-items-center gap-2">
          <span className="badge rounded-pill bg-primary-subtle text-primary-emphasis border border-primary-subtle small fw-semibold">
            Est
          </span>
          QuickBooks estimate linked
        </li>
        <li className="d-flex align-items-center gap-2">
          <span className="badge rounded-pill bg-info-subtle text-info-emphasis border border-info-subtle small fw-semibold">
            Inv
          </span>
          QuickBooks invoice linked
        </li>
        <li className="d-flex align-items-center gap-2">
          <span className="badge rounded-pill bg-success-subtle text-success-emphasis border border-success-subtle small fw-semibold">
            Paid
          </span>
          Invoice fully paid
        </li>
        <li className="d-flex align-items-center gap-2">
          <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle small fw-semibold d-inline-flex align-items-center gap-1">
            <i className="material-icons-outlined" style={{ fontSize: 13, lineHeight: 1 }} aria-hidden>
              checklist
            </i>
            n
          </span>
          Open ticket tasks (number = open)
        </li>
        <li className="d-flex align-items-center gap-2">
          <span className="badge rounded-pill bg-light text-body-secondary border small fw-semibold d-inline-flex align-items-center gap-1">
            <i className="material-icons-outlined" style={{ fontSize: 13, lineHeight: 1 }} aria-hidden>
              task_alt
            </i>
            n
          </span>
          All tasks done (number = completed)
        </li>
        <li className="d-flex align-items-center gap-2">
          <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis border border-warning-subtle small d-inline-flex align-items-center p-1">
            <i className="material-icons-outlined" style={{ fontSize: 14, lineHeight: 1 }} aria-hidden>
              sync
            </i>
          </span>
          Ticket changed after last QB sync
        </li>
        <li className="d-flex align-items-center gap-2">
          <span className="badge rounded-pill bg-light text-body-secondary border small d-inline-flex align-items-center p-1">
            <i className="material-icons-outlined" style={{ fontSize: 15, lineHeight: 1 }} aria-hidden>
              folder_special
            </i>
          </span>
          Google Drive folder
        </li>
        <li className="d-flex align-items-center gap-2">
          <span className="badge rounded-pill bg-light text-body-secondary border small d-inline-flex align-items-center p-1">
            <i className="material-icons-outlined" style={{ fontSize: 15, lineHeight: 1 }} aria-hidden>
              mail
            </i>
          </span>
          Gmail thread
        </li>
      </ul>
    </aside>
  );
}
