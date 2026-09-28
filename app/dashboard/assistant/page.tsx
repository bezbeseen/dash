import Link from 'next/link';
import { AssistantChat } from '@/components/assistant-chat';

export const dynamic = 'force-dynamic';

export default function AssistantPage() {
  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Dash Manager</h1>
          <p className="board-topbar-sub">
            AI assistant with live read-only views of your board, to-dos, and QuickBooks connection status.
          </p>
        </div>
        <div className="board-topbar-actions">
          <Link href="/dashboard" className="btn btn-sm btn-outline-secondary">
            Back to board
          </Link>
        </div>
      </header>

      <div className="mt-3">
        <AssistantChat />
      </div>
    </div>
  );
}
