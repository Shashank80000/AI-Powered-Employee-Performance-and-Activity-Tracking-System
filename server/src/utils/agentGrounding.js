/**
 * Evidence check for the AI model's answer. Every observation and recommendation must cite facts from the fact
 * sheet, and every number it states must appear in those facts. Anything that fails is removed and reported, so
 * the page only ever shows statements the records support.
 */

const NUMBER = /\d+(?:,\d{3})*(?:\.\d+)?/g;

/** Numbers written in a piece of text, e.g. "3 of 4 tasks (66.7%)" -> [3, 4, 66.7]. */
export function numbersIn(text) {
  return (String(text ?? '').match(NUMBER) ?? []).map((token) => Number(token.replace(/,/g, '')));
}

const key = (n) => String(Math.round(n * 10) / 10);

// Identifiers and exact timestamps are not evidence for a number: digits inside a record id ("...99a3") or an
// ISO time would otherwise let "99 tasks are overdue" pass.
const IGNORED_KEYS = new Set(['id', 'signIn', 'signOut']);
// Names people write: their digits ("Report export #7", "EMP-004") only count when the statement quotes them.
const QUOTED_KEYS = new Set(['title', 'code']);

/** Every number inside a fact (value, label, note, dates, quoted names), plus the rounded forms people write. */
function collect(value, into, text, field) {
  if (IGNORED_KEYS.has(field)) return into;
  if (typeof value === 'number' && Number.isFinite(value)) {
    for (const n of [value, Math.abs(value), Math.round(value), Math.round(Math.abs(value))]) into.add(key(n));
  } else if (typeof value === 'string') {
    if (QUOTED_KEYS.has(field) && !text.toLowerCase().includes(value.toLowerCase())) return into;
    for (const n of numbersIn(value)) collect(n, into, text);
  } else if (Array.isArray(value)) {
    for (const item of value) collect(item, into, text);
  } else if (value && typeof value === 'object') {
    for (const [name, item] of Object.entries(value)) collect(item, into, text, name);
  }
  return into;
}

function unsupportedNumbers(text, facts, extra) {
  const allowed = collect(facts, new Set(extra.map(key)), String(text ?? ''));
  return numbersIn(text).filter((n) => !allowed.has(key(n)));
}

/**
 * Checks one claim. Returns null when it is supported, or the reason it was rejected.
 * `factById` holds the whole sheet; only the facts the claim cites can support its numbers.
 */
export function checkClaim(text, factIds, factById, extraNumbers = []) {
  if (!Array.isArray(factIds) || factIds.length === 0) return 'Cites no evidence';
  const unknown = factIds.filter((id) => !factById.has(id));
  if (unknown.length) return `Cites facts that do not exist: ${unknown.join(', ')}`;
  const unsupported = unsupportedNumbers(text, factIds.map((id) => factById.get(id)), extraNumbers);
  if (unsupported.length) return `States numbers not found in the cited facts: ${unsupported.join(', ')}`;
  return null;
}

/**
 * Filters the model's output down to supported statements.
 * `extraNumbers` (e.g. the period length) are allowed everywhere; `questionNumbers` only in the main answer, which
 * may repeat the question ("the top 3"). `fallbackAnswer` replaces the main answer when it fails the check.
 */
export function groundOutput(output, facts, { extraNumbers = [], questionNumbers = [], fallbackAnswer }) {
  const factById = new Map(facts.map((item) => [item.id, item]));
  const rejected = [];
  let checked = 0;

  const keep = (items, type, textOf) =>
    (Array.isArray(items) ? items : []).filter((item) => {
      checked += 1;
      const reason = checkClaim(textOf(item), item.factIds, factById, extraNumbers);
      if (reason) rejected.push({ type, text: textOf(item), reason });
      return !reason;
    });

  const observations = keep(output.observations, 'observation', (item) => item.statement);
  const recommendations = keep(output.recommendations, 'recommendation', (item) => `${item.action} ${item.rationale ?? ''}`);

  checked += 1;
  let answer = output.answer;
  const answerReason = checkClaim(answer?.text, answer?.factIds, factById, [...extraNumbers, ...questionNumbers]);
  if (answerReason) {
    rejected.push({ type: 'answer', text: answer?.text ?? '', reason: answerReason });
    answer = fallbackAnswer;
  }

  // Limitations cite no single fact, but may not introduce numbers that appear nowhere in the sheet.
  const limitations = (Array.isArray(output.limitations) ? output.limitations : []).filter((text) => {
    checked += 1;
    const unsupported = unsupportedNumbers(text, facts, extraNumbers);
    if (unsupported.length) rejected.push({ type: 'limitation', text, reason: `States numbers not in the fact sheet: ${unsupported.join(', ')}` });
    return unsupported.length === 0;
  });

  return {
    answer,
    observations,
    recommendations,
    limitations,
    validation: { checked, accepted: checked - rejected.length, rejected, answerReplaced: Boolean(answerReason) }
  };
}
