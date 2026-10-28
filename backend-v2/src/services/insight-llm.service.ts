import { env } from '../config/env';
import { fill, Insight, placeholders, validateRephrase } from '../lib/insights';

/**
 * Optional rewording of an insight by an OpenAI-compatible chat endpoint
 * (INSIGHT_LLM_URL, INSIGHT_LLM_KEY, INSIGHT_LLM_MODEL) - in production a
 * self-hosted freeLLMApi router, with a profile of a few strong models.
 *
 * The model sees the sentence with {{placeholders}} where the numbers go and
 * must keep them; the server fills them in afterwards. Models get numbers
 * wrong more than anything else, so they never write one.
 *
 * Free models also drift in meaning ("lightest start of 7 days" became
 * "lighter over 7 days") in ways the placeholder guard can't see, so a valid
 * rewording is only used if a second call judges it to state the same facts.
 * Unset, slow, failing, off-script or judged different: the template is sent.
 */
export type Fetch = typeof fetch;

/**
 * One attempt per temperature. A warmer retry varies the wording and is a
 * different request, so the router's response cache can't hand back the
 * same rejected answer.
 */
const TEMPERATURES = [0.7, 0.9, 1.0];

const REWORD_PROMPT =
  'You reword one short push notification about household water use. ' +
  'Words in double braces are placeholders for numbers and times that the app fills in later. ' +
  'Your sentence must contain every placeholder listed, exactly as written, once each. ' +
  'Never write digits. Do not add facts, causes, advice or numbers. Keep words like "about". ' +
  'Keep the meaning: the same time frame, the same comparison, and whether use went up or down. ' +
  'Say it in your own words - not a copy of the sentence with a word or two changed. ' +
  'One sentence, under 120 characters, warm and plain, no emoji. Reply with the sentence only.';

const JUDGE_PROMPT =
  'You check a reworded push notification about household water use. ' +
  'Answer YES only if sentence B states exactly the same facts as sentence A: the same time frame ' +
  '(so far today, today, yesterday, this week, or a run of days), the same comparison, the same direction ' +
  '(more or less), the same numbers, nothing added and nothing left out. Otherwise answer NO. Reply with YES or NO only.';

async function chat(
  fetchImpl: Fetch,
  messages: { role: 'system' | 'user'; content: string }[],
  temperature: number,
  timeoutMs: number,
): Promise<string> {
  const res = await fetchImpl(env.insightLlmUrl!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.insightLlmKey ? { Authorization: `Bearer ${env.insightLlmKey}` } : {}),
    },
    body: JSON.stringify({ model: env.insightLlmModel, temperature, max_tokens: 80, messages }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content?.trim() ?? '';
}

export async function rephraseInsight(
  insight: Insight,
  opts: { fetchImpl?: Fetch; timeoutMs?: number } = {},
): Promise<{ text: string; source: 'template' | 'llm' }> {
  const fallback = { text: insight.text, source: 'template' as const };
  // Rewording could turn "no measurable drop" into a "no leak" claim.
  if (insight.kind === 'quiet_night') return fallback;
  if (!env.insightLlmUrl || !env.insightLlmModel) return fallback;

  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? env.insightLlmTimeoutMs;
  const keep = placeholders(insight.template).map((p) => `{{${p}}}`).join(', ');
  const direction =
    insight.facts.direction === 'less' ? 'down' : insight.facts.direction === 'more' ? 'up' : null;
  const request = [
    keep && `Placeholders to keep: ${keep}`,
    direction && `Use went: ${direction}`,
    `Sentence: ${insight.template}`,
  ]
    .filter(Boolean)
    .join('\n');

  const rejected: string[] = [];
  for (const temperature of TEMPERATURES) {
    try {
      const reworded = (
        await chat(fetchImpl, [{ role: 'system', content: REWORD_PROMPT }, { role: 'user', content: request }], temperature, timeoutMs)
      ).replace(/^"|"$/g, '');
      if (reworded === insight.template) {
        rejected.push('unchanged');
        continue;
      }
      if (!validateRephrase(reworded, insight)) {
        rejected.push('off-script');
        continue;
      }
      const text = fill(reworded, insight.facts);
      const verdict = await chat(
        fetchImpl,
        [{ role: 'system', content: JUDGE_PROMPT }, { role: 'user', content: `A: ${insight.text}\nB: ${text}` }],
        0,
        timeoutMs,
      );
      if (/^\W*yes\b/i.test(verdict)) return { text, source: 'llm' };
      rejected.push('judged different');
    } catch (error) {
      rejected.push((error as Error).name === 'TimeoutError' ? 'timeout' : (error as Error).message);
    }
  }
  console.log(`[insights] LLM rewording not used for ${insight.kind} (${rejected.join(', ')}); sending the template`);
  return fallback;
}
