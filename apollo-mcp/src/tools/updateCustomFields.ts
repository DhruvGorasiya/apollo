import { z } from 'zod';
import type { ApolloClient } from '../lib/apollo.js';

export const updateContactCustomFieldsInputSchema = z.object({
  contact_id: z.string().describe('Apollo contact_id of the contact to update'),
  fields: z
    .record(z.string(), z.string())
    .describe('Key-value pairs where keys are Apollo custom field names and values are strings to write'),
});

export type UpdateContactCustomFieldsArgs = z.infer<typeof updateContactCustomFieldsInputSchema>;

export async function update_contact_custom_fields(
  args: UpdateContactCustomFieldsArgs,
  deps: { apollo: ApolloClient },
) {
  const result = await deps.apollo.updateContactCustomFields(args.contact_id, args.fields);

  return {
    content: [
      {
        type: 'text' as const,
        text: `Updated Apollo custom fields for contact_id=${args.contact_id}.`,
      },
    ],
    structuredContent: { result },
  };
}

