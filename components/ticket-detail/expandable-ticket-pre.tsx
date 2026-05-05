'use client';

import { useId, useMemo, useState } from 'react';

const COLLAPSE_CHAR_THRESHOLD = 1_200;
const COLLAPSE_LINE_THRESHOLD = 22;

type ExpandableTicketPreProps = {
  text: string;
  /** Max height (px) of the pre when collapsed */
  collapsedMaxPx?: number;
};

export function ExpandableTicketPre({ text, collapsedMaxPx = 280 }: ExpandableTicketPreProps) {
  const reactId = useId();
  const preDomId = `ticket-expand-pre-${reactId.replace(/:/g, '')}`;
  const { needsToggle, lineCount, charCount } = useMemo(() => {
    const lines = text.split(/\r\n|\r|\n/).length;
    const chars = text.length;
    return {
      needsToggle: chars > COLLAPSE_CHAR_THRESHOLD || lines > COLLAPSE_LINE_THRESHOLD,
      lineCount: lines,
      charCount: chars,
    };
  }, [text]);

  const [expanded, setExpanded] = useState(!needsToggle);

  if (!needsToggle) {
    return <pre className="ticket-lead-body" id={preDomId}>{text}</pre>;
  }

  return (
    <div className="ticket-expandable-pre">
      <pre
        id={preDomId}
        className={`ticket-lead-body ${expanded ? 'is-expanded' : 'is-collapsed'}`}
        style={expanded ? undefined : { maxHeight: collapsedMaxPx, overflow: 'hidden' }}
      >
        {text}
      </pre>
      {!expanded ? <div className="ticket-expandable-pre-fade" aria-hidden /> : null}
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary ticket-expandable-pre-toggle"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={preDomId}
      >
        {expanded
          ? 'Show less'
          : `Expand full text (${lineCount} lines${
              charCount < 1024 ? `, ${charCount} chars` : `, ${(charCount / 1024).toFixed(1)} KB`
            })`}
      </button>
    </div>
  );
}
