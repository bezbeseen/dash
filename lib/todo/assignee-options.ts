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
 * Deduplicated assignee options for to-do and ticket task dropdowns: env list,
 * everyone who appears on to-dos or tasks, and the current user.
 */
export async function loadTodoAssigneeOptions(
  prisma: PrismaClient,
  sessionEmail: string | null,
): Promise<string[]> {
  const domain = workspaceDomain();
  const valid = (e: string) => e.toLowerCase().endsWith(`@${domain}`);

  const fromEnv = parseEnvEmailList().filter(valid);

  const [todoRows, taskRows] = await Promise.all([
    prisma.todo.findMany({
      select: { assigneeEmail: true, createdByEmail: true },
    }),
    prisma.task.findMany({
      select: { assigneeEmail: true, createdByEmail: true },
    }),
  ]);
  const fromDb = new Set<string>();
  for (const r of [...todoRows, ...taskRows]) {
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

/** Compact label for tables; every option shares the workspace domain, so the local part is unique. */
export function emailLocalPart(email: string): string {
  return email.split('@')[0] || email;
}
