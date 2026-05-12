type Props = {
  transcript: string | null;
  metaBlocks?: string[];
  /** Job cards keep this collapsed; ticket detail can open by default. */
  defaultOpen?: boolean;
};

/**
 * Collapsible transcript / chat log for inbound marketing leads (kept outside the card link
 * so expanding does not navigate).
 */
export function InboundLeadConversationPanel({
  transcript,
  metaBlocks = [],
  defaultOpen = false,
}: Props) {
  const t = transcript?.trim() ?? '';
  const hasTranscript = t.length > 0;
  const hasMeta = metaBlocks.length > 0;
  if (!hasTranscript && !hasMeta) return null;

  const summaryLabel =
    hasTranscript && hasMeta
      ? 'Conversation, transcript & links'
      : hasTranscript
        ? 'Conversation / transcript'
        : 'Recording & CRM links';

  return (
    <details className="inbound-lead-conversation-panel border rounded-2 small" open={defaultOpen}>
      <summary className="inbound-lead-conversation-panel-summary px-2 py-1 fw-semibold text-body-secondary user-select-none">
        {summaryLabel}
      </summary>
      <div className="inbound-lead-conversation-panel-body px-2 pb-2 pt-1">
        {hasTranscript ? <pre className="ticket-inbound-transcript-pre mb-0">{t}</pre> : null}
        {hasMeta ? (
          <div
            className={
              hasTranscript
                ? 'border-top pt-2 mt-2 small text-body-secondary detail-mono text-break'
                : 'small text-body-secondary detail-mono text-break'
            }
          >
            {metaBlocks.map((b, i) => (
              <div key={i}>{b}</div>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}
