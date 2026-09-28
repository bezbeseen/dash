import type { Job } from '@prisma/client';
import { inboundLeadCardDisplayParts, jobPrimaryHeading, sanitizeJobProjectDescription } from '@/lib/domain/job-display';

export const PROJECT_BOOK_FILE_NAME = 'Project book.json';

export type ProjectBookPayload = {
  status: string;
  date: string;
  client: string;
  job: string;
  location: string;
  coverImage: string;
  brief: { lead: string; constraints: Array<[string, string]> };
  approach: Array<{ title: string; text: string }>;
  pieces: Array<{ id: string; name: string; note: string; image: string; field: string; size: string }>;
  specs: Array<[string, string]>;
  next: Array<{ title: string; text: string }>;
  contact: { shop: string; line: string; email: string };
};

function todayLabel(): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const now = new Date();
  return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function briefLeadFromJob(
  job: Pick<Job, 'customerName' | 'projectName' | 'projectDescription' | 'inboundLeadKind'>,
): string {
  if (job.inboundLeadKind != null) {
    const parts = inboundLeadCardDisplayParts({
      projectName: job.projectName,
      projectDescription: job.projectDescription,
      inboundLeadKind: job.inboundLeadKind,
    });
    const synopsis = parts?.synopsis?.trim();
    if (synopsis) return synopsis.slice(0, 500);
  }
  const desc = sanitizeJobProjectDescription(job.projectName, job.projectDescription);
  return (desc ?? '').slice(0, 500);
}

export function seedProjectBookFromJob(
  job: Pick<Job, 'customerName' | 'projectName' | 'projectDescription' | 'inboundLeadKind'>,
): ProjectBookPayload {
  const heading = jobPrimaryHeading(job);
  return {
    status: 'Concept · For review',
    date: todayLabel(),
    client: job.customerName.trim(),
    job: heading,
    location: '',
    coverImage: '',
    brief: {
      lead: briefLeadFromJob(job),
      constraints: [
        ['Client', job.customerName.trim()],
        ['Job', heading],
      ],
    },
    approach: [
      { title: '', text: '' },
      { title: '', text: '' },
      { title: '', text: '' },
    ],
    pieces: [{ id: '01', name: '', note: '', image: '', field: 'White', size: '24 × 6' }],
    specs: [
      ['Format', ''],
      ['Qty', ''],
      ['Status', 'Concept'],
    ],
    next: [
      { title: 'Pick', text: '' },
      { title: 'Confirm build', text: '' },
      { title: 'Produce', text: '' },
    ],
    contact: {
      shop: 'Be Seen',
      line: 'Print · Sign · Design',
      email: 'contact@beseensignshop.com',
    },
  };
}

export function isProjectBookPayload(value: unknown): value is ProjectBookPayload {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.job === 'string' && typeof o.client === 'string';
}
