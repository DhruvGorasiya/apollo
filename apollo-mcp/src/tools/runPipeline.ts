import { z } from 'zod';
import type { ApolloClient } from '../lib/apollo.js';

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const runOutreachPipelineInputSchema = z.object({
  contact_id: z.string().describe('Apollo contact_id of the contact to personalize and enroll'),
  personalized_subject: z.string().describe('Subject line to write to Apollo custom fields'),
  personalized_intro: z.string().describe('Intro/body snippet to write to Apollo custom fields'),
  dry_run: z.boolean().optional().default(false).describe('If true, generate but do not write to Apollo or enroll'),
  // Optional overrides:
  sequence_id: z.string().optional().describe('Apollo sequence_id to enroll into (overrides env default)'),
  email_account_id: z.string().optional().describe('Apollo email account id (overrides env default)'),
});

export type RunOutreachPipelineArgs = z.infer<typeof runOutreachPipelineInputSchema>;

export async function run_outreach_pipeline(args: RunOutreachPipelineArgs, deps: { apollo: ApolloClient }) {
  if (!args.dry_run) {
    await deps.apollo.updateContactCustomFields(args.contact_id, {
      personalized_subject: args.personalized_subject,
      personalized_intro: args.personalized_intro,
    });

    const sequenceId = args.sequence_id ?? getRequiredEnv('DEFAULT_SEQUENCE_ID');
    const emailAccountId = args.email_account_id ?? getRequiredEnv('DEFAULT_EMAIL_ACCOUNT_ID');

    await deps.apollo.addContactsToSequence({
      contactId: args.contact_id,
      sequenceId,
      emailAccountId,
    });
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: [
          args.dry_run ? 'Dry run: provided personalization only (no Apollo write, no enrollment).' : 'Wrote Claude-provided personalization and enrolled contact.',
          '',
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
      dry_run: args.dry_run,
    },
  };
}

