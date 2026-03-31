import { z } from 'zod';
import type { ApolloClient } from '../lib/apollo.js';

export const personalizeContactInputSchema = z.object({
  contact_id: z.string().describe('Apollo contact_id of the contact to personalize'),
  personalized_subject: z.string().describe('Generated subject line to write to Apollo'),
  personalized_intro: z.string().describe('Generated intro to write to Apollo'),
});

export type PersonalizeContactArgs = z.infer<typeof personalizeContactInputSchema>;

export async function personalize_contact(args: PersonalizeContactArgs, deps: { apollo: ApolloClient }) {
  await deps.apollo.updateContactCustomFields(args.contact_id, {
    personalized_subject: args.personalized_subject,
    personalized_intro: args.personalized_intro,
  });

  return {
    content: [
      {
        type: 'text' as const,
        text: [
          'Wrote Claude-provided personalization into Apollo custom fields:',
          `contact_id=${args.contact_id}`,
          '',
          `personalized_subject: ${args.personalized_subject}`,
          '',
          `personalized_intro: ${args.personalized_intro}`,
        ].join('\n'),
      },
    ],
    structuredContent: {
      contact_id: args.contact_id,
      personalized_subject: args.personalized_subject,
      personalized_intro: args.personalized_intro,
    },
  };
}

