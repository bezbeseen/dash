'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { TaskAssigneeSelect } from '@/components/task-assignee-select';
import { TaskDoneButton } from '@/components/task-done-button';
import type { JobCardTask } from '@/lib/domain/job-card-tasks';
import { emailLocalPart } from '@/lib/todo/assignee-options';

/** Collapsed, a card lists at most this many rows; past that the last row is "+N more". */
const COLLAPSED_ROWS = 3;

type Props = {
  jobId: string;
  tasks: JobCardTask[];
  doneCount: number;
  assigneeOptions: string[];
};

/**
 * Open tasks on a board card. Rendered outside the card link so clicks do not open the ticket;
 * the checklist pill expands assignee pickers, Done buttons and a quick add form. A half-typed
 * task holds auto-sync's refresh (`data-autosync-hold`).
 */
export function JobCardTasks({ jobId, tasks, doneCount, assigneeOptions }: Props) {
  const router = useRouter();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const tasksHref = `/dashboard/jobs/${jobId}#ticket-tasks` as const;
  const listed = tasks.length > COLLAPSED_ROWS ? tasks.slice(0, COLLAPSED_ROWS - 1) : tasks;
  const anyOverdue = tasks.some((t) => t.overdue);
  const summary = [`${tasks.length} open`, doneCount > 0 ? `${doneCount} done` : null].filter(Boolean).join(', ');

  async function addTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setFailed(false);
    const body = new FormData();
    body.set('jobId', jobId);
    body.set('title', trimmed);
    body.set('assigneeEmail', assignee);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      body,
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setFailed(true);
      return;
    }
    setTitle('');
    setAssignee('');
    router.refresh();
  }

  return (
    <div
      className="job-card-tasks"
      data-autosync-hold={title.trim() || busy ? '' : undefined}
      onDragStart={(e) => e.preventDefault()}
    >
      {tasks.length > 0 ? (
        <button
          type="button"
          className={`badge rounded-pill border fw-semibold job-card-tasks-toggle ${
            anyOverdue
              ? 'bg-danger-subtle text-danger-emphasis border-danger-subtle'
              : 'bg-secondary-subtle text-secondary-emphasis border-secondary-subtle'
          }`}
          aria-expanded={open}
          aria-controls={panelId}
          title={`${summary}${anyOverdue ? ' (overdue)' : ''}. ${open ? 'Hide' : 'Assign, finish or add'} tasks.`}
          onClick={() => setOpen((v) => !v)}
        >
          <i className="material-icons-outlined" aria-hidden>
            checklist
          </i>
          {tasks.length}
          <i className="material-icons-outlined" aria-hidden>
            {open ? 'expand_less' : 'expand_more'}
          </i>
        </button>
      ) : (
        <button
          type="button"
          className="job-card-tasks-add-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide task form' : '+ Add task'}
        </button>
      )}

      {open ? (
        <div id={panelId} className="job-card-tasks-panel">
          {tasks.length > 0 ? (
            <ul className="job-card-task-list">
              {tasks.map((t) => (
                <li key={t.id} className="job-card-task-edit">
                  <div className="job-card-task">
                    <span className="job-card-task-title">{t.title}</span>
                    {t.dueLabel ? (
                      <span className={t.overdue ? 'job-card-task-overdue' : 'job-card-task-due'}>
                        {t.overdue ? `Overdue · ${t.dueLabel}` : `Due ${t.dueLabel}`}
                      </span>
                    ) : null}
                  </div>
                  <div className="job-card-task-controls">
                    <TaskAssigneeSelect
                      taskId={t.id}
                      assigneeEmail={t.assigneeEmail}
                      options={assigneeOptions}
                      label={`Assignee for ${t.title}`}
                      className="job-card-task-assign"
                    />
                    <TaskDoneButton taskId={t.id} />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <form className="job-card-task-add" onSubmit={(e) => void addTask(e)}>
            <input
              className="form-control form-control-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New task"
              aria-label="New task title"
              autoFocus={tasks.length === 0}
            />
            <div className="job-card-task-controls">
              <select
                className="form-select form-select-sm job-card-task-assign"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                aria-label="Assign new task"
              >
                <option value="">Unassigned</option>
                {assigneeOptions.map((email) => (
                  <option key={email} value={email}>
                    {emailLocalPart(email)}
                  </option>
                ))}
              </select>
              <button className="btn btn-sm btn-outline-primary" type="submit" disabled={busy || !title.trim()}>
                {busy ? 'Adding…' : 'Add'}
              </button>
            </div>
            {failed ? <div className="small text-danger">Could not add the task.</div> : null}
          </form>
          <Link href={tasksHref} className="job-card-tasks-more">
            All tasks on the ticket →
          </Link>
        </div>
      ) : tasks.length > 0 ? (
        <ul className="job-card-task-list">
          {listed.map((t) => (
            <li key={t.id} className="job-card-task">
              <span className="job-card-task-title" title={t.title}>
                {t.title}
              </span>
              {t.overdue ? (
                <span className="job-card-task-overdue" title={`Due ${t.dueLabel}`}>
                  Overdue
                </span>
              ) : null}
              <span className="job-card-task-assignee" title={t.assigneeEmail ?? 'Unassigned'}>
                {t.assigneeEmail ? emailLocalPart(t.assigneeEmail) : '—'}
              </span>
            </li>
          ))}
          {tasks.length > listed.length ? (
            <li>
              <Link href={tasksHref} className="job-card-tasks-more">
                +{tasks.length - listed.length} more
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
