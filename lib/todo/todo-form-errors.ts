/** Shared copy for ?todo_error= from /api/todos and /api/todos/:id/*. */
export function todoFormErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'title_required':
      return 'Add a title for the to-do.';
    case 'dueAt_invalid':
      return 'Due date was not valid; use the date picker or yyyy-mm-dd.';
    case 'assignee_invalid':
      return 'Assignee must be a Google Workspace email for your organization, or leave unassigned.';
    case 'not_found':
      return 'That to-do no longer exists.';
    default:
      return code ? 'Something went wrong saving the to-do.' : null;
  }
}
