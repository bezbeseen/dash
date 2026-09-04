import { sanitizeJobProjectDescription } from '@/lib/domain/job-display';
import { formatYelpSurveyLines, type YelpSurveyPair } from '@/lib/yelp/survey';
import { buildYelpBizThreadUrl, redactDestructiveYelpUrls, safeYelpUrl } from '@/lib/yelp/url';

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

  // Yelp's documented reply deep link; the thread URL is the older scheme it will replace.
  const bid = lead.business_id;
  const conv = lead.conversation_id;
  const inbox =
    safeYelpUrl(typeof lead.link_to_reply_in_yelp === 'string' ? lead.link_to_reply_in_yelp : null) ??
    (typeof bid === 'string' && typeof conv === 'string'
      ? safeYelpUrl(buildYelpBizThreadUrl(bid, conv))
      : null);
  if (inbox) lines.push(`Inbox: ${inbox}`);

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
    const pairs: YelpSurveyPair[] = [];
    for (const row of survey) {
      const r = asRecord(row);
      const q = typeof r?.question_text === 'string' ? r.question_text : '';
      if (!q) continue;
      const answers = r?.answer_text;
      pairs.push({ question: q, answers: Array.isArray(answers) ? answers.map((a) => String(a)) : [] });
    }
    lines.push(...formatYelpSurveyLines(pairs));
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

  const merged = redactDestructiveYelpUrls(lines.join('\n').trim());
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
