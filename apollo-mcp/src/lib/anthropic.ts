import { buildPersonalizationSystemPrompt, buildPersonalizationUserPrompt } from '../prompts/personalize.js';

export type PersonalizedContent = {
  personalized_subject: string;
  personalized_intro: string;
};

export type PersonalizeInputs = {
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  headline?: string;
  extra_context?: string;
};

function extractJsonObject(text: string): unknown {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Anthropic did not return a JSON object');
  }
  const jsonStr = text.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonStr);
}

export async function generatePersonalizedSubjectAndIntro(inputs: PersonalizeInputs): Promise<PersonalizedContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const system = buildPersonalizationSystemPrompt();
  const user = buildPersonalizationUserPrompt(inputs);

  // Note: model is specified in PRD for speed/cost.
  const model = 'claude-haiku-4-5-20251001';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system,
      max_tokens: 600,
      temperature: 0.4,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: user }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const payload = await res.text().catch(() => '');
    throw new Error(`Anthropic request failed (${res.status}): ${payload}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const contentText = data.content?.find((c) => c.type === 'text')?.text;
  if (!contentText) throw new Error('Anthropic response missing text content');

  const parsed = extractJsonObject(contentText) as Partial<PersonalizedContent>;
  if (!parsed.personalized_subject || !parsed.personalized_intro) {
    throw new Error('Anthropic JSON missing personalized_subject/personalized_intro');
  }

  return {
    personalized_subject: String(parsed.personalized_subject),
    personalized_intro: String(parsed.personalized_intro),
  };
}

