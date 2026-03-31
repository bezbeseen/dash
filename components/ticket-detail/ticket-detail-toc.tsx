export type TicketTocItem = {
  id: string;
  label: string;
};

type Props = {
  items: TicketTocItem[];
};

/** In-page anchor nav for ticket sections (sticky on wide screens). */
export function TicketDetailToc({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <nav className="ticket-detail-toc" aria-label="On this ticket">
      <div className="ticket-detail-toc-title">On this page</div>
      <ul className="ticket-detail-toc-list">
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className="ticket-detail-toc-link">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
