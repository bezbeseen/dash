import type { Job } from '@prisma/client';
import { InboundLeadKind } from '@prisma/client';
import { scoreLeadSubstance, type LeadSubstanceResult } from '@/lib/domain/lead-substance';

export type PrequoteColumnKey = 'new' | 'active' | 'thin' | 'stale';

export const PREQUOTE_COLUMNS: PrequoteColumnKey[] = ['new', 'thin', 'active', 'stale'];

export type PrequoteSourceFilter = 'all' | 'form' | 'conversation' | 'voice' | 'yelp' | 'other';

export const PREQUOTE_SOURCE_FILTERS: { key: PrequoteSourceFilter; label: string }[] = [
  { key: 'all', label: 'All sources' },
  { key: 'yelp', label: 'Yelp' },
  { key: 'form', label: 'Form' },
  { key: 'conversation', label: 'Conversation' },
  { key: 'voice', label: 'Voice' },
  { key: 'other', label: 'Other' },
];

const MS_PER_DAY = 86_400_000;
const NEW_MAX_DAYS = 3;
const STALE_MIN_DAYS = 7;

export function prequoteColumnTitle(column: PrequoteColumnKey): string {
  switch (column) {
    case 'new':
      return 'New';
    case 'active':
      return 'Active';
    case 'thin':
      return 'Thin';
    case 'stale':
      return 'Stale';
    default: {
      const _exhaustive: never = column;
      return _exhaustive;
    }
  }
}

export function prequoteColumnHint(column: PrequoteColumnKey): string {
  switch (column) {
    case 'new':
      return 'Last 3 days — looks like a real lead';
    case 'active':
      return '3–7 days — follow up or quote';
    case 'thin':
      return 'Short / no contact — likely junk';
    case 'stale':
      return '7+ days — decide: quote, nurture, or dismiss';
    default: {
      const _exhaustive: never = column;
      return _exhaustive;
    }
  }
}

export function parsePrequoteSourceFilter(raw: string | undefined): PrequoteSourceFilter {
  if (
    raw === 'form' ||
    raw === 'conversation' ||
    raw === 'voice' ||
    raw === 'yelp' ||
    raw === 'other'
  ) {
    return raw;
  }
  return 'all';
}

export function jobMatchesPrequoteSource(
  job: Pick<Job, 'inboundLeadKind'>,
  source: PrequoteSourceFilter,
): boolean {
  if (source === 'all') return true;
  if (source === 'other') return job.inboundLeadKind == null;
  if (source === 'form') return job.inboundLeadKind === InboundLeadKind.FORM;
  if (source === 'conversation') return job.inboundLeadKind === InboundLeadKind.CONVERSATION;
  if (source === 'voice') return job.inboundLeadKind === InboundLeadKind.VOICE_CALL;
  if (source === 'yelp') return job.inboundLeadKind === InboundLeadKind.YELP_LEAD;
  return true;
}

export function prequoteColumnForJob(
  job: Pick<Job, 'createdAt'>,
  substance: LeadSubstanceResult,
  now: Date = new Date(),
): PrequoteColumnKey {
  if (substance.thin) return 'thin';

  const ageDays = (now.getTime() - job.createdAt.getTime()) / MS_PER_DAY;
  if (ageDays >= STALE_MIN_DAYS) return 'stale';
  if (ageDays < NEW_MAX_DAYS) return 'new';
  return 'active';
}

export type PrequoteTriageJob = Pick<
  Job,
  | 'id'
  | 'createdAt'
  | 'inboundLeadKind'
  | 'projectName'
  | 'projectDescription'
  | 'customerName'
  | 'gmailThreadId'
>;

export function triagePrequoteJobs(
  jobs: PrequoteTriageJob[],
  source: PrequoteSourceFilter,
  now?: Date,
): {
  substanceByJobId: Map<string, LeadSubstanceResult>;
  byColumn: Record<PrequoteColumnKey, PrequoteTriageJob[]>;
  filteredCount: number;
} {
  const substanceByJobId = new Map<string, LeadSubstanceResult>();
  const byColumn: Record<PrequoteColumnKey, PrequoteTriageJob[]> = {
    new: [],
    active: [],
    thin: [],
    stale: [],
  };

  const filtered = jobs.filter((job) => jobMatchesPrequoteSource(job, source));

  for (const job of filtered) {
    const substance = scoreLeadSubstance(job);
    substanceByJobId.set(job.id, substance);
    const column = prequoteColumnForJob(job, substance, now);
    byColumn[column].push(job);
  }

  return { substanceByJobId, byColumn, filteredCount: filtered.length };
}

export function prequoteFilterHref(
  basePath: string,
  opts: { source?: PrequoteSourceFilter },
): string {
  const params = new URLSearchParams();
  if (opts.source && opts.source !== 'all') params.set('source', opts.source);
  const q = params.toString();
  return q ? `${basePath}?${q}` : basePath;
}
