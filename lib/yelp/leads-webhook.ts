import { sanitizeJobProjectDescription } from '@/lib/domain/job-display';

export type YelpLeadWebhookUpdate = {
  event_type?: string;
  event_id?: string;
  lead_id?: string;
  interaction_time?: string;
};

/** Body from https://docs.developer.yelp.com/docs/leads-webhooks */
export function extractLeadIdsFromYelpWebhook(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const data = (body as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return [];
  const updates = (data as Record<string, unknown>).updates;
  if (!Array.isArray(updates)) return [];
  const ids = new Set<string>();
  for (const u of updates) {
    if (!u || typeof u !== 'object') continue;
    const leadId = (u as Record<string, unknown>).lead_id;
    if (typeof leadId === 'string' && leadId.trim()) ids.add(leadId.trim());
  }
  return [...ids];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

/** Build ticket description from Get Lead + Get Lead events responses. */
export function buildYelpLeadProjectDescription(
  lead: Record<string, unknown>,
  events: unknown[],
): { projectName: string; projectDescription: string | null; customerName: string; seedEmail: string | null } {
  const project = asRecord(lead.project);
  const jobNames = project?.job_names;
  const firstJob =
    Array.isArray(jobNames) && jobNames.length > 0 && typeof jobNames[0] === 'string'
      ? jobNames[0].trim()
      : 'Yelp request';

  const user = asRecord(lead.user);
  const customerName =
    typeof user?.display_name === 'string' && user.display_name.trim()
      ? user.display_name.trim().slice(0, 512)
      : 'Yelp lead';

  const lines: string[] = [];
  lines.push('Source: Yelp (Leads / Request a Quote)');

  const bid = lead.business_id;
  const conv = lead.conversation_id;
  if (typeof bid === 'string' && typeof conv === 'string') {
    lines.push(`Inbox: https://biz.yelp.com/messaging/${encodeURIComponent(bid)}/thread/${encodeURIComponent(conv)}`);
  }

  const phone =
    typeof lead.phone_number === 'string'
      ? lead.phone_number
      : typeof lead.temporary_phone_number === 'string'
        ? lead.temporary_phone_number
        : '';
  if (phone.trim()) lines.push(`Phone: ${phone.trim().slice(0, 80)}`);

  const tempEm =
    typeof lead.temporary_email_address === 'string' ? lead.temporary_email_address.trim() : '';
  if (tempEm.includes('@')) {
    lines.push(`Reply (Yelp proxy email): ${tempEm.slice(0, 200)}`);
  }

  const survey = project?.survey_answers;
  if (Array.isArray(survey) && survey.length > 0) {
    lines.push('');
    lines.push('Project questionnaire:');
    for (const row of survey.slice(0, 50)) {
      const r = asRecord(row);
      const q = typeof r?.question_text === 'string' ? r.question_text : '';
      const answers = r?.answer_text;
      if (!q) continue;
      lines.push(`\n${q}`);
      if (Array.isArray(answers)) {
        for (const a of answers) {
          lines.push(`  • ${String(a).slice(0, 500)}`);
        }
      }
    }
  }

  const textEvents = events.filter((e) => {
    const ev = asRecord(e);
    if (ev?.event_type !== 'TEXT') return false;
    const content = asRecord(ev.event_content);
    const t = content?.text ?? content?.fallback_text;
    return typeof t === 'string' && t.trim().length > 0;
  });

  const tail = textEvents.slice(-12);
  if (tail.length > 0) {
    lines.push('');
    lines.push('Conversation (latest):');
    for (const raw of tail) {
      const ev = asRecord(raw)!;
      const who =
        ev.user_type === 'CONSUMER'
          ? 'Customer'
          : ev.user_type === 'BIZ'
            ? 'Business'
            : String(ev.user_type ?? '?');
      const content = asRecord(ev.event_content)!;
      const txt = String(content.text ?? content.fallback_text ?? '').trim();
      lines.push(`\n[${who}] ${txt.slice(0, 4000)}`);
    }
  }

  const merged = lines.join('\n').trim();
  const projectDescription = sanitizeJobProjectDescription(
    `Yelp · ${firstJob}`,
    merged.length > 0 ? merged : null,
  );

  const seedEmail = tempEm.includes('@') ? tempEm.slice(0, 512) : null;

  return {
    projectName: `Yelp · ${firstJob}`.slice(0, 512),
    projectDescription,
    customerName,
    seedEmail,
  };
}
