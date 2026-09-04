/**
 * Yelp "Request a Quote" questionnaire handling, shared by the notification-email
 * parser and the Leads API webhook so both produce identically formatted tickets.
 * Pure and credential-free: see `npm run verify:yelp-email-parser`.
 */

export type YelpSurveyPair = { question: string; answers: string[] };

/** Free-text prompt whose answer is usually the most useful thing in the lead. */
const FREE_TEXT_QUESTION = /other\s+details|anything\s+else|additional\s+(?:details|information)|describe/i;

/** Yelp asks for the job's ZIP; useful for a sign shop judging travel. */
const LOCATION_QUESTION = /in\s+what\s+location|what\s+(?:is\s+the\s+)?location|where\s+(?:do|is)/i;

/**
 * Lines that end in "?" but belong to Yelp's own template rather than the questionnaire.
 * Without this a nag line would open a bogus question and swallow the next answer.
 */
const NOT_A_SURVEY_QUESTION = [
  /response\s+(?:rate|time)/i,
  /text\s+notifications?/i,
  /unsubscribe/i,
  /interested\?/i,
  /already\s+replied\?/i,
  /report\s+this\s+conversation/i,
  /need\s+help\?/i,
];

function looksLikeSurveyQuestion(line: string): boolean {
  const t = line.trim();
  if (!t.endsWith('?')) return false;
  if (t.length < 8 || t.length > 200) return false;
  return !NOT_A_SURVEY_QUESTION.some((re) => re.test(t));
}

/**
 * Pulls question/answer pairs out of the flattened email text. Yelp renders each
 * question on its own line followed by the consumer's answer on the following line(s),
 * with no labels to anchor on.
 */
export function parseYelpSurveyPairsFromText(text: string): YelpSurveyPair[] {
  const lines = text.split('\n');
  const pairs: YelpSurveyPair[] = [];
  let current: YelpSurveyPair | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (looksLikeSurveyQuestion(line)) {
      current = { question: line, answers: [] };
      pairs.push(current);
      continue;
    }
    if (!current || !line) continue;
    // Cap the run so a future template line that escapes cleaning cannot swallow the tail.
    if (current.answers.length >= 10) continue;
    current.answers.push(line);
  }

  return pairs
    .map((p) => ({ question: p.question, answers: p.answers.filter(Boolean) }))
    .filter((p) => p.answers.length > 0);
}

/** Matches the Leads API layout: a blank line, the question, then bulleted answers. */
export function formatYelpSurveyLines(pairs: YelpSurveyPair[]): string[] {
  if (pairs.length === 0) return [];
  const lines: string[] = ['', 'Project questionnaire:'];
  for (const pair of pairs.slice(0, 50)) {
    if (!pair.question.trim()) continue;
    lines.push(`\n${pair.question}`);
    for (const answer of pair.answers) {
      lines.push(`  • ${String(answer).slice(0, 500)}`);
    }
  }
  return lines;
}

export function findFreeTextAnswer(pairs: YelpSurveyPair[]): string | null {
  const hit = pairs.find((p) => FREE_TEXT_QUESTION.test(p.question));
  const joined = hit?.answers.join(' ').trim();
  return joined ? joined.slice(0, 2000) : null;
}

/** Returns a 5-digit ZIP from the location question, when the consumer gave one. */
export function findServiceZip(pairs: YelpSurveyPair[]): string | null {
  for (const pair of pairs) {
    if (!LOCATION_QUESTION.test(pair.question)) continue;
    const zip = /\b(\d{5})(?:-\d{4})?\b/.exec(pair.answers.join(' '));
    if (zip) return zip[1];
  }
  return null;
}

/** Location answers are often just a ZIP, but can be a city; keep whatever was given. */
export function findServiceLocation(pairs: YelpSurveyPair[]): string | null {
  const hit = pairs.find((p) => LOCATION_QUESTION.test(p.question));
  const joined = hit?.answers.join(' ').trim();
  return joined ? joined.slice(0, 200) : null;
}
