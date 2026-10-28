import { env } from '../config/env';
import { fill, Insight, validateRephrase } from '../lib/insights';

/**
 * Optional rewording of an insight by an OpenAI-compatible chat endpoint
 * (INSIGHT_LLM_URL, INSIGHT_LLM_KEY, INSIGHT_LLM_MODEL) - in production a
 * self-hosted freeLLMApi router with model "auto".
 *
 * The model sees the sentence with {{placeholders}} where the numbers go and
 * must keep them; the server fills them in afterwards. Models get numbers
 * wrong more than anything else, so they never write one. Unset, slow,
 * failing or off-script, the template is sent.
 */
export type Fetch = typeof fetch;

export async function rephraseInsight(
  insight: Insight,
  opts: { fetchImpl?: Fetch; timeoutMs?: number } = {},
): Promise<{ text: string; source: 'template' | 'llm' }> {
  const fallback = { text: insight.text, source: 'template' as const };
  // Rewording could turn "no measurable drop" into a "no leak" claim.
  if (insight.kind === 'quiet_night') return fallback;
  if (!env.insightLlmUrl || !env.insightLlmModel) return fallback;

  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(env.insightLlmUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.insightLlmKey ? { Authorization: `Bearer ${env.insightLlmKey}` } : {}),
      },
      body: JSON.stringify({
        model: env.insightLlmModel,
        // Warm enough to vary day to day; the guard catches anything off-script.
        temperature: 0.8,
        max_tokens: 80,
        messages: [
          {
            role: 'system',
            content:
              'You reword one short push notification about household water use. ' +
              'Words in double braces like {{used_l}} are placeholders for numbers and times: keep every placeholder exactly as written, once each. ' +
              'Never write digits. Do not add facts, causes, advice or numbers. Keep words like "about". Keep the meaning, including whether use went up or down. ' +
              'One sentence, under 120 characters, warm and plain, no emoji. Reply with the sentence only.',
          },
          {
            role: 'user',
            content: `Facts: ${JSON.stringify(insight.facts)}\nSentence: ${insight.template}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    });
    if (!res.ok) return fallback;
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reworded = body.choices?.[0]?.message?.content?.trim().replace(/^"|"$/g, '') ?? '';
    return validateRephrase(reworded, insight)
      ? { text: fill(reworded, insight.facts), source: 'llm' }
      : fallback;
  } catch (error) {
    console.error('[insights] LLM rephrase failed, using template:', (error as Error).message);
    return fallback;
  }
}
