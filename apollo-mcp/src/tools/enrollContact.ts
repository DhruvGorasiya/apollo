import { z } from 'zod';
import type { ApolloClient } from '../lib/apollo.js';

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const enrollContactInputSchema = z.object({
  contact_id: z.string().describe('Apollo contact_id of the contact to enroll'),
  sequence_id: z.string().optional().describe('Apollo sequence_id to enroll into'),
  email_account_id: z
    .string()
    .optional()
    .describe('Apollo email account id (send_email_from_email_account_id)'),
});

export type EnrollContactArgs = z.infer<typeof enrollContactInputSchema>;

export async function enroll_contact(args: EnrollContactArgs, deps: { apollo: ApolloClient }) {
  const sequenceId = args.sequence_id ?? getRequiredEnv('DEFAULT_SEQUENCE_ID');
  const emailAccountId = args.email_account_id ?? getRequiredEnv('DEFAULT_EMAIL_ACCOUNT_ID');

  const result = await deps.apollo.addContactsToSequence({
    contactId: args.contact_id,
    sequenceId,
    emailAccountId,
  });

  return {
    content: [
      {
        type: 'text' as const,
        text: `Enrollment requested for contact_id=${args.contact_id} into sequence_id=${sequenceId}.`,
      },
    ],
    structuredContent: { result },
  };
}

