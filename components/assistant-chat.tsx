'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import Link from 'next/link';
import React, { useCallback, useMemo, useState } from 'react';

/** AI SDK surfaces non-OK bodies as Error.message; unwrap our JSON `{ error }` for humans. */
function formatAssistantError(raw: string | undefined): string {
  if (!raw?.trim()) return 'Request failed.';
  const t = raw.trim();
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as { error?: string };
      if (typeof j.error === 'string' && j.error.trim()) return j.error.trim();
    } catch {
      /* ignore */
    }
  }
  return raw;
}

function renderPart(part: UIMessage['parts'][number], key: React.Key) {
  if (part.type === 'text') {
    return (
      <div key={key} className="assistant-msg-text mb-2" style={{ whiteSpace: 'pre-wrap' }}>
        {part.text}
      </div>
    );
  }

  if (part.type === 'reasoning') {
    return (
      <details key={key} className="small text-body-secondary mb-2">
        <summary className="cursor-pointer">Reasoning</summary>
        <div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>
          {part.text}
        </div>
      </details>
    );
  }

  if (part.type.startsWith('tool-')) {
    const name = part.type.replace(/^tool-/, '');
    const state = 'state' in part ? String(part.state) : '';
    return (
      <div key={key} className="small rounded border px-2 py-1 mb-2 text-body-secondary bg-body-tertiary">
        <span className="font-monospace">{name}</span>
        {state ? <span className="ms-2 opacity-75">({state})</span> : null}
      </div>
    );
  }

  return null;
}

export function AssistantChat() {
  const [input, setInput] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/assistant/chat',
        credentials: 'include',
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error, clearError } = useChat({
    transport,
    onError: (err) => {
      setBanner(formatAssistantError(err.message));
    },
    onFinish: () => {
      clearError();
    },
  });

  const busy = status === 'streaming' || status === 'submitted';

  const alertText = useMemo(
    () => formatAssistantError(banner ?? error?.message),
    [banner, error?.message],
  );

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || busy) return;
      setInput('');
      setBanner(null);
      clearError();
      await sendMessage({ text });
    },
    [input, busy, sendMessage, clearError],
  );

  return (
    <div className="assistant-chat card shadow-sm border-0">
      <div className="card-body d-flex flex-column" style={{ minHeight: '420px', maxHeight: 'min(70vh, 640px)' }}>
        {(banner || error) && (
          <div className="alert alert-warning py-2 small mb-3" role="status">
            {alertText}
          </div>
        )}

        <div className="flex-grow-1 overflow-auto mb-3 border rounded p-3 bg-body-secondary bg-opacity-10">
          {messages.length === 0 ? (
            <p className="text-body-secondary small mb-0">
              Ask for a pipeline summary, open to-dos, QuickBooks sync health, or search jobs by name. You can also ask
              for draft copy or code snippets to use elsewhere. Nothing runs on the server automatically.
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`mb-4 ${m.role === 'user' ? 'text-end' : ''}`}>
                <div
                  className={`d-inline-block text-start rounded p-2 px-3 ${
                    m.role === 'user' ? 'bg-primary text-white' : 'bg-white border'
                  }`}
                  style={{ maxWidth: '100%', width: m.role === 'user' ? 'min(100%, 42rem)' : 'min(100%, 48rem)' }}
                >
                  <div className="small opacity-75 mb-1">{m.role === 'user' ? 'You' : 'Dash Manager'}</div>
                  {m.parts.map((part, i) => renderPart(part, `${m.id}-${i}`))}
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={onSubmit} className="d-flex gap-2 align-items-end flex-wrap">
          <label className="flex-grow-1 mb-0 w-100">
            <span className="visually-hidden">Message</span>
            <textarea
              className="form-control"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Example: Summarize the board and my open to-dos..."
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void onSubmit(e);
                }
              }}
            />
          </label>
          <div className="d-flex gap-2">
            {busy ? (
              <button type="button" className="btn btn-outline-secondary" onClick={() => stop()}>
                Stop
              </button>
            ) : null}
            <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
              Send
            </button>
          </div>
        </form>

        <p className="small text-body-secondary mt-3 mb-0">
          Read-only tools. Requires <code className="small">OPENAI_API_KEY</code> on the server.{' '}
          <Link href="/dashboard/todos">To-dos</Link>
          {' | '}
          <Link href="/dashboard/tickets">Tickets</Link>
        </p>
      </div>
    </div>
  );
}
