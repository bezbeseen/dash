'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { emailLocalPart } from '@/lib/todo/assignee-options';

type Props = {
  taskId: string;
  assigneeEmail: string | null;
  options: string[];
  label?: string;
  className?: string;
};

/** Saves on change. Keyed on the stored assignee so a refresh with someone else's edit resets it. */
export function TaskAssigneeSelect(props: Props) {
  return <AssigneeSelect key={props.assigneeEmail ?? ''} {...props} />;
}

function AssigneeSelect({ taskId, assigneeEmail, options, label = 'Assignee', className }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(assigneeEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const choices = assigneeEmail && !options.includes(assigneeEmail) ? [...options, assigneeEmail] : options;

  async function save(next: string) {
    const previous = value;
    setValue(next);
    setBusy(true);
    setFailed(false);
    const res = await fetch(`/api/tasks/${taskId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ assigneeEmail: next || null }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setValue(previous);
      setFailed(true);
      return;
    }
    router.refresh();
  }

  return (
    <div className={className}>
      <select
        className="form-select form-select-sm"
        style={{ minWidth: '7.5rem' }}
        aria-label={label}
        title={value || 'Unassigned'}
        value={value}
        disabled={busy}
        onChange={(e) => void save(e.target.value)}
      >
        <option value="">Unassigned</option>
        {choices.map((email) => (
          <option key={email} value={email}>
            {emailLocalPart(email)}
          </option>
        ))}
      </select>
      {failed ? <div className="small text-danger mt-1">Could not save.</div> : null}
    </div>
  );
}
