import { gmail_v1 } from 'googleapis';
import { gmailHeader } from '@/lib/gmail/message-text';
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
};

export type ThreadHeaderMessage = {
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  snippet?: string;
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

  return {
    email: chosen.address,
    name: displayNameFor(chosen),
    subject: subject || 'Email lead',
    snippet: snippet.slice(0, 500),
    participants,
  };
}

export function gmailLeadProjectDescription(customer: GmailThreadCustomer): string {
  const lines = [`Email: ${customer.email}`];
  if (customer.subject) lines.push(`Subject: ${customer.subject}`);
  if (customer.snippet) lines.push('', customer.snippet);
  return lines.join('\n').slice(0, 2000);
}
