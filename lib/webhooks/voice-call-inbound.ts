import { sanitizeJobProjectDescription } from '@/lib/domain/job-display';
import { resolveInboundCustomerName } from '@/lib/domain/inbound-lead-display';
import {
  normalizeInboundPayload,
  pickInboundString,
  resolveInboundLeadEmail,
} from '@/lib/webhooks/marketing-inbound';

/** Prefer one long field with the full notification / email body. */
const FULL_TEXT_KEYS = [
  'email_body',
  'emailBody',
  'raw',
  'rawBody',
  'text',
  'body',
  'message',
  'content',
  'plaintext',
  'plainText',
  'notification_body',
  'call_notification',
] as const;

/** Parse “Caller’s Name:” style blocks (voice AI email templates). */
export function extractVoiceCallNotifyFieldsFromText(text: string): {
  callerName?: string;
  email?: string;
  phone?: string;
} {
  const callerName = text.match(/Caller'?s Name:\s*([^\n\r]+)/i)?.[1]?.trim();
  const email = text.match(/Caller'?s Email:\s*(\S+)/i)?.[1]?.trim();
  const phone = text.match(/Caller'?s Number:\s*(\S+)/i)?.[1]?.trim();
  return { callerName, email, phone };
}

function buildVoiceCallDescriptionFromStructuredFields(body: Record<string, unknown>): string {
  const lines: string[] = [];
  const addLine = (label: string, ...keys: string[]) => {
    const v = pickInboundString(body, ...(keys as unknown as string[]));
    if (v) lines.push(`${label}: ${v}`);
  };
  addLine("Caller's Name", 'callerName', 'caller_name', 'Callers Name', 'caller');
  addLine("Caller's Email", 'callerEmail', 'caller_email', 'email');
  addLine("Caller's Number", 'callerNumber', 'caller_number', 'phone', 'callerPhone');
  addLine('Number Called', 'numberCalled', 'number_called', 'dialedNumber');
  addLine('Call Duration', 'callDuration', 'call_duration', 'duration', 'durationSeconds');
  addLine('AI Agent Name', 'aiAgentName', 'ai_agent_name', 'agentName', 'agent_name');
  const summary = pickInboundString(
    body,
    'callSummary',
    'call_summary',
    'summary',
    'Call Summary',
  );
  if (summary) {
    lines.push('', 'Call summary:', summary);
  }
  const details = pickInboundString(body, 'detailsCollected', 'details_collected', 'details');
  if (details) {
    lines.push('', 'Details collected:', details);
  }
  const transcript = pickInboundString(body, 'transcript', 'callTranscript', 'call_transcript');
  if (transcript) {
    lines.push('', 'Call transcript:', transcript);
  }
  return lines.join('\n').trim();
}

export type VoiceCallLeadPayload = {
  projectDescription: string | null;
  customerName: string;
  projectName: string;
  email: string | undefined;
};

/**
 * Normalize raw webhook JSON (or `{ body: "<plain email>" }`) into a Dash lead.
 */
export function buildVoiceCallLeadFromPayload(raw: Record<string, unknown>): VoiceCallLeadPayload {
  const body = normalizeInboundPayload(raw);

  let fullText = '';
  for (const k of FULL_TEXT_KEYS) {
    const v = body[k];
    if (typeof v === 'string' && v.trim().length > 40) {
      fullText = v.trim();
      break;
    }
  }

  const structuredFallback = buildVoiceCallDescriptionFromStructuredFields(body);
  const rawDescription = fullText || structuredFallback || '';
  const parsed = extractVoiceCallNotifyFieldsFromText(rawDescription);

  const email =
    resolveInboundLeadEmail(body) ||
    parsed.email ||
    pickInboundString(body, 'callerEmail', 'caller_email', 'email') ||
    undefined;

  const agent =
    pickInboundString(body, 'aiAgentName', 'ai_agent_name', 'agentName', 'agent_name') || 'Voice AI';
  const projectName = (
    pickInboundString(body, 'projectName', 'project_name', 'subject', 'title') || `Voice call — ${agent}`
  ).slice(0, 512);

  const projectDescription = sanitizeJobProjectDescription(
    projectName,
    rawDescription.length > 0 ? rawDescription : null,
  );

  const rawCustomerName =
    pickInboundString(body, 'callerName', 'caller_name', 'name', 'Callers Name') ||
    parsed.callerName ||
    email ||
    'Voice caller';

  const customerName = resolveInboundCustomerName(body, rawCustomerName, projectDescription);

  return { projectDescription, customerName, projectName, email };
}
