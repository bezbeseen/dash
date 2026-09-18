import { gmail_v1 } from 'googleapis';
import { extractGmailMessageText, gmailHeader } from '@/lib/gmail/message-text';
import { extractSignaturePhoneFromMessages } from '@/lib/gmail/signature-phone';
import {
  buildCounterpartyFilter,
  classifyParticipant,
  normalizeSubject,
  parseAddressEntries,
  type AddressEntry,
  type CounterpartyFilter,
} from '@/lib/gmail/thread-match';

export type GmailThreadCustomer = {
  email: string;
  name: string;
  subject: string;
  snippet: string;
  participants: AddressEntry[];
  /** Display-formatted US phone from the customer's signature, when one is found. */
  phone?: string | null;
};

export type ThreadHeaderMessage = {
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  snippet?: string;
  body?: string;
};

export function threadMessagesFromGmail(thread: gmail_v1.Schema$Thread): ThreadHeaderMessage[] {
  return (thread.messages ?? []).map((m) => {
    const headers = m.payload?.headers;
    return {
      from: gmailHeader(headers, 'From'),
      to: gmailHeader(headers, 'To'),
      cc: gmailHeader(headers, 'Cc'),
      subject: gmailHeader(headers, 'Subject'),
      snippet: (m.snippet ?? '').trim(),
      body: extractGmailMessageText(m.payload),
    };
  });
}

function collectEntries(header: string | undefined, into: AddressEntry[]): void {
  for (const entry of parseAddressEntries(header)) {
    if (!into.some((e) => e.address === entry.address)) into.push(entry);
  }
}

function displayNameFor(entry: AddressEntry): string {
  const named = entry.name.trim();
  if (named) return named.slice(0, 120);
  const local = entry.address.split('@')[0] ?? entry.address;
  const spaced = local.replace(/[._+-]+/g, ' ').trim();
  if (!spaced) return entry.address;
  return spaced.replace(/\b\w/g, (ch) => ch.toUpperCase()).slice(0, 120);
}

/**
 * First outside participant — prefer the From of the earliest message that isn't the shop.
 */
export function pickCustomerFromThreadMessages(
  messages: readonly ThreadHeaderMessage[],
  mailboxEmails: readonly string[],
): GmailThreadCustomer | null {
  const filter: CounterpartyFilter = buildCounterpartyFilter(mailboxEmails);
  const participants: AddressEntry[] = [];
  let subject = '';
  let snippet = '';

  for (const m of messages) {
    if (!subject && m.subject?.trim()) subject = normalizeSubject(m.subject);
    if (!snippet && m.snippet?.trim()) snippet = m.snippet.trim();
    collectEntries(m.from, participants);
    collectEntries(m.to, participants);
    collectEntries(m.cc, participants);
  }

  let chosen: AddressEntry | null = null;
  for (const m of messages) {
    for (const entry of parseAddressEntries(m.from)) {
      if (classifyParticipant(entry.address, filter) === 'counterparty') {
        chosen = entry;
        break;
      }
    }
    if (chosen) break;
  }

  if (!chosen) {
    for (const entry of participants) {
      if (classifyParticipant(entry.address, filter) === 'counterparty') {
        chosen = entry;
        break;
      }
    }
  }

  if (!chosen) return null;

  const phone = extractSignaturePhoneFromMessages(messages, mailboxEmails, chosen.address);

  return {
    email: chosen.address,
    name: displayNameFor(chosen),
    subject: subject || 'Email lead',
    snippet: snippet.slice(0, 500),
    participants,
    phone,
  };
}

export function gmailLeadProjectDescription(customer: GmailThreadCustomer): string {
  const lines = [`Email: ${customer.email}`];
  if (customer.phone) lines.push(`Phone: ${customer.phone}`);
  if (customer.subject) lines.push(`Subject: ${customer.subject}`);
  if (customer.snippet) lines.push('', customer.snippet);
  return lines.join('\n').slice(0, 2000);
}

const TICKET_LABEL_MAX = 400;

/** Shop-typed Gmail ticket name. Empty input falls back to the email subject. */
export function sanitizeGmailTicketLabel(raw: string | null | undefined, fallback: string): string {
  const cleaned = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, TICKET_LABEL_MAX);
  if (cleaned) return cleaned;
  const fb = fallback.replace(/\s+/g, ' ').trim().slice(0, TICKET_LABEL_MAX);
  return fb || 'Email lead';
}
