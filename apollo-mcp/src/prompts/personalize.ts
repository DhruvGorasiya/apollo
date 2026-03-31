export function buildPersonalizationSystemPrompt(): string {
  // Hard rules enforced via the system prompt (subject/intro constraints).
  return [
    'You are an expert cold-outreach copywriter.',
    'Return ONLY a valid JSON object with EXACT keys:',
    '"personalized_subject" and "personalized_intro".',
    '',
    'Subject rules:',
    '- Max 10 words.',
    '- Do NOT start the subject with "I".',
    '- Do NOT use phrases like "Quick question".',
    '- Reference something specific about the recipient or their company.',
    '',
    'Intro rules:',
    '- 1-2 sentences max.',
    '- Lead with the sender’s relevant credential (Weaviate credential).',
    '- Tie directly to the recipient’s world (company/team/product context provided).',
    '- Avoid generic openers like "Hope this finds you well".',
    '',
    'Output format (no markdown, no extra text):',
    '{"personalized_subject":"...","personalized_intro":"..."}',
  ].join('\n');
}

export function buildPersonalizationUserPrompt(inputs: {
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  headline?: string;
  extra_context?: string;
}): string {
  const headlinePart = inputs.headline ? `Headline/bio signal: ${inputs.headline}` : '';
  const extraPart = inputs.extra_context ? `Extra context: ${inputs.extra_context}` : '';

  // Sender background is intentionally kept in the prompt so Claude follows the PRD guidance.
  const senderBackground = [
    'Sender background (use naturally, do not mention the word "prompt"):',
    '- I previously worked on hybrid search infrastructure at Weaviate.',
    '- I have an MS Computer Science background (Northeastern).',
    '',
    'Target role / relevance:',
    `Recipient: ${inputs.first_name} ${inputs.last_name}, ${inputs.title} at ${inputs.company}.`,
    headlinePart ? headlinePart : 'Headline/bio signal: (none provided)',
    inputs.extra_context ? `Extra context: ${inputs.extra_context}` : 'Extra context: (none provided)',
    '',
    'Task: Write a subject and intro that follow the system constraints.',
  ]
    .filter(Boolean)
    .join('\n');

  return senderBackground;
}

