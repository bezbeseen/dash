import { prisma } from '@/lib/db/prisma';

export type DashboardHomeTodoItem = {
  id: string;
  title: string;
  dueAt: Date | null;
  assigneeEmail: string | null;
};

export type DashboardTodosModule = {
  openTotal: number;
  openMine: number;
  openOverdue: number;
  upcoming: DashboardHomeTodoItem[];
};

export async function loadDashboardTodosModule(
  viewerEmailLower: string | null,
  opts?: { upcomingLimit?: number },
): Promise<DashboardTodosModule> {
  const limit = opts?.upcomingLimit ?? 8;
  const now = new Date();

  const [openTotal, openMine, openOverdue, upcoming] = await Promise.all([
    prisma.todo.count({ where: { status: 'OPEN' } }),
    viewerEmailLower
      ? prisma.todo.count({
          where: { status: 'OPEN', assigneeEmail: viewerEmailLower },
        })
      : Promise.resolve(0),
    prisma.todo.count({
      where: { status: 'OPEN', dueAt: { lt: now } },
    }),
    prisma.todo.findMany({
      where: { status: 'OPEN' },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: limit,
      select: { id: true, title: true, dueAt: true, assigneeEmail: true },
    }),
  ]);

  return { openTotal, openMine, openOverdue, upcoming };
}
