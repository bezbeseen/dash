import type { PrismaClient } from '@prisma/client';
import { workspaceDomain } from '@/lib/workspace-domain';

function parseEnvEmailList(): string[] {
  const raw = process.env.TODO_ASSIGNEE_EMAILS?.trim();
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Deduplicated assignee options for to-do dropdowns: env list, everyone who
 * appears on to-dos, and the current user.
 */
export async function loadTodoAssigneeOptions(
  prisma: PrismaClient,
  sessionEmail: string | null,
): Promise<string[]> {
  const domain = workspaceDomain();
  const valid = (e: string) => e.toLowerCase().endsWith(`@${domain}`);

  const fromEnv = parseEnvEmailList().filter(valid);

  const fromRows = await prisma.todo.findMany({
    select: { assigneeEmail: true, createdByEmail: true },
  });
  const fromDb = new Set<string>();
  for (const r of fromRows) {
    if (r.assigneeEmail && valid(r.assigneeEmail)) {
      fromDb.add(r.assigneeEmail.toLowerCase());
    }
    if (r.createdByEmail && valid(r.createdByEmail)) {
      fromDb.add(r.createdByEmail.toLowerCase());
    }
  }

  const merged = new Set<string>([...fromEnv, ...fromDb]);
  if (sessionEmail) {
    merged.add(sessionEmail.toLowerCase());
  }
  return [...merged].sort((a, b) => a.localeCompare(b));
}

/** Empty string = unassigned; otherwise must be a Google Workspace email for this org. */
export function isAllowedAssigneeEmail(raw: string | null | undefined): boolean {
  if (raw == null || raw.trim() === '') return true;
  return raw.trim().toLowerCase().endsWith(`@${workspaceDomain()}`);
}
