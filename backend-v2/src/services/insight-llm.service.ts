import { env } from '../config/env';
import { Insight, validateRephrase } from '../lib/insights';

/**
 * Optional rewording of an insight by an OpenAI-compatible chat endpoint
 * (INSIGHT_LLM_URL, INSIGHT_LLM_KEY, INSIGHT_LLM_MODEL). The model only sees
 * facts the server computed and may only reword them: any number in its reply
 * that is not in the facts sends the template sentence instead. Unset, slow or
 * failing, the template is used.
 */
export type Fetch = typeof fetch;

export async function rephraseInsight(
  insight: Insight,
  opts: { fetchImpl?: Fetch; timeoutMs?: number } = {},
): Promise<{ text: string; source: 'template' | 'llm' }> {
  const fallback = { text: insight.text, source: 'template' as const };
  // Numeric validation cannot verify that rewording preserves this qualification.
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
        temperature: 0.4,
        max_tokens: 80,
        messages: [
          {
            role: 'system',
            content:
              'You reword one short push notification about household water use. Keep every number exactly as given. ' +
              'Do not add numbers, causes, advice or facts. Preserve the word estimated whenever the sentence describes an estimate. ' +
              'One sentence, under 140 characters, friendly and plain. Reply with the sentence only.',
          },
          {
            role: 'user',
            content: `Facts: ${JSON.stringify(insight.facts)}\nSentence: ${insight.text}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    });
    if (!res.ok) return fallback;
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content?.trim().replace(/^"|"$/g, '') ?? '';
    return validateRephrase(text, insight) ? { text, source: 'llm' } : fallback;
  } catch (error) {
    console.error('[insights] LLM rephrase failed, using template:', (error as Error).message);
    return fallback;
  }
}
