export type CalendarMailbox = { id: string; googleEmail: string };

export function pickCalendarMailbox(
  connections: CalendarMailbox[],
  sessionEmail: string,
  requested?: string,
): CalendarMailbox | null {
  if (connections.length === 0) return null;
  const req = (requested ?? '').trim().toLowerCase();
  const sess = sessionEmail.trim().toLowerCase();
  return (
    connections.find((c) => c.googleEmail.toLowerCase() === req) ??
    connections.find((c) => c.googleEmail.toLowerCase() === sess) ??
    connections[0]!
  );
}
