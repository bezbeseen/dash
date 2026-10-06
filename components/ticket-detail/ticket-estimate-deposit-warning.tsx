type Props = {
  sectionId?: string;
  docNumber?: string;
  reminder: string;
  quickBooksUrl: string;
};

/** QuickBooks' API can't set an estimate's deposit request, so the shop turns it on by hand. */
export function TicketEstimateDepositWarning({ sectionId, docNumber, reminder, quickBooksUrl }: Props) {
  return (
    <div id={sectionId} className="alert alert-warning py-2 px-3 mb-3" role="status">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div>
          <strong>No deposit request</strong>
          <span className="meta">
            {' '}
            Estimate{docNumber ? ` #${docNumber}` : ''} has no deposit request in QuickBooks. {reminder}
          </span>
        </div>
        <a
          href={quickBooksUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm btn-outline-dark flex-shrink-0"
        >
          Open in QuickBooks
        </a>
      </div>
    </div>
  );
}
