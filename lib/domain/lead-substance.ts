import type { Job } from '@prisma/client';
import { InboundLeadKind } from '@prisma/client';
import { sanitizeJobProjectDescription, splitInboundStoredDescription } from '@/lib/domain/job-display';
import { extractInboundPhoneRaw } from '@/lib/domain/inbound-lead-display';
import { loadInboundPhoneRules, matchInboundPhoneRule } from '@/lib/domain/inbound-phone-rules';

export type LeadSubstanceResult = {
  thin: boolean;
  /** Short phrases for badge tooltip. */
  reasons: string[];
  hasContact: boolean;
  hasSignKeywords: boolean;
  substanceChars: number;
};

const SIGN_KEYWORD_RE =
  /\b(banners?|signs?|wraps?|vehicle|vinyl|channel\s*letters?|letters?|install(?:ation)?|decals?|magnets?|flags?|tents?|backdrop|prints?|printing|graphics?|storefront|illuminated|monument|yard\s*sign|coroplast|aluminum|acrylic|dimensional|facade|marquee|neon|seg\b|mesh|banner\s*stand|step\s*(?:and\s*)?repeat|trade\s*show|exhibit|booth|wayfinding|ada\b|pylon|cabinet)/i;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/;

type SubstanceJob = Pick<
  Job,
  'inboundLeadKind' | 'projectName' | 'projectDescription' | 'customerName' | 'gmailThreadId'
>;

function extractContact(text: string): { hasEmail: boolean; hasPhone: boolean } {
  return {
    hasEmail: EMAIL_RE.test(text) || /\bEmail:\s*\S+/i.test(text),
    hasPhone: PHONE_RE.test(text) || /\bPhone:\s*\S+/i.test(text),
  };
}

function countConversationTurns(transcript: string | null): number {
  if (!transcript?.trim()) return 0;
  const roleLines = transcript.match(/^(Customer|User|Contact|Caller|Agent|Bot|AI|Staff|You|Rep):/gim);
  if (roleLines && roleLines.length >= 2) return roleLines.length;
  const paragraphs = transcript.split(/\n\n+/).filter((p) => p.trim().length > 10);
  return paragraphs.length;
}

function combinedInboundText(job: SubstanceJob): {
  fullText: string;
  transcript: string | null;
  submittedFields: string | null;
} {
  const raw = sanitizeJobProjectDescription(job.projectName, job.projectDescription);
  if (!raw) return { fullText: '', transcript: null, submittedFields: null };

  const split = splitInboundStoredDescription(raw);
  const parts = [
    split.contactSummary,
    split.conversationTranscript,
    split.submittedFields,
    ...split.metaBlocks,
  ].filter((p): p is string => Boolean(p?.trim()));

  return {
    fullText: parts.join('\n').trim(),
    transcript: split.conversationTranscript,
    submittedFields: split.submittedFields,
  };
}

function notThin(reason: string, extras: Partial<LeadSubstanceResult> = {}): LeadSubstanceResult {
  return {
    thin: false,
    reasons: [reason],
    hasContact: extras.hasContact ?? false,
    hasSignKeywords: extras.hasSignKeywords ?? false,
    substanceChars: extras.substanceChars ?? 0,
  };
}

/**
 * Heuristic “thin lead” score for pre-quote triage. Conversation / voice use transcript girth;
 * forms use submitted fields; Yelp is lenient.
 */
export function scoreLeadSubstance(job: SubstanceJob): LeadSubstanceResult {
  if (job.gmailThreadId) {
    return notThin('Gmail thread linked — someone is working this lead.', { hasContact: true });
  }

  const phoneRule = matchInboundPhoneRule(extractInboundPhoneRaw(job), loadInboundPhoneRules());
  if (phoneRule?.autoThin) {
    return {
      thin: true,
      reasons: [`Known line: ${phoneRule.label} (${phoneRule.digits}…)`],
      hasContact: true,
      hasSignKeywords: false,
      substanceChars: 0,
    };
  }

  if (job.inboundLeadKind == null) {
    return notThin('Not a marketing webhook lead.');
  }

  const { fullText, transcript, submittedFields } = combinedInboundText(job);
  const contact = extractContact(fullText);
  const hasContact = contact.hasEmail || contact.hasPhone;
  const hasSignKeywords = SIGN_KEYWORD_RE.test(fullText);
  const substanceChars = fullText.replace(/\s+/g, ' ').trim().length;
  const turns = countConversationTurns(transcript);
  const reasons: string[] = [];

  if (job.inboundLeadKind === InboundLeadKind.YELP_LEAD) {
    if (substanceChars >= 40 || hasContact || hasSignKeywords) {
      return { thin: false, reasons: ['Yelp lead with project or contact detail.'], hasContact, hasSignKeywords, substanceChars };
    }
    return {
      thin: true,
      reasons: ['Yelp lead with almost no project detail or contact info.'],
      hasContact,
      hasSignKeywords,
      substanceChars,
    };
  }

  if (job.inboundLeadKind === InboundLeadKind.FORM) {
    const submittedLen = submittedFields?.trim().length ?? 0;
    const thin = !hasContact && submittedLen < 30 && substanceChars < 60;
    if (thin) {
      return {
        thin: true,
        reasons: ['Form with little detail and no contact info.'],
        hasContact,
        hasSignKeywords,
        substanceChars,
      };
    }
    return { thin: false, reasons: [], hasContact, hasSignKeywords, substanceChars };
  }

  // Conversation + voice — need multiple weak signals before “thin”.
  let thinSignals = 0;
  if (substanceChars < 100) {
    thinSignals++;
    reasons.push('Short overall message');
  }
  if (!hasContact) {
    thinSignals++;
    reasons.push('No email or phone found');
  }
  if (!hasSignKeywords) {
    thinSignals++;
    reasons.push('No sign / print project keywords');
  }
  if (
    (job.inboundLeadKind === InboundLeadKind.CONVERSATION ||
      job.inboundLeadKind === InboundLeadKind.VOICE_CALL) &&
    turns < 2
  ) {
    thinSignals++;
    reasons.push('Little back-and-forth in transcript');
  }

  const thin = thinSignals >= 3;

  return {
    thin,
    reasons: thin ? reasons : [],
    hasContact,
    hasSignKeywords,
    substanceChars,
  };
}

export function thinLeadBadgeTitle(result: LeadSubstanceResult): string {
  if (!result.thin) return '';
  const detail = result.reasons.length > 0 ? result.reasons.join(' · ') : 'Likely low-intent lead.';
  return `Thin lead — ${detail}`;
}
