import { z } from 'zod';
import type { ApolloClient } from '../lib/apollo.js';

export const getContactInputSchema = z.object({
  contact_id: z.string().describe('Apollo contact_id of the contact to fetch'),
});

export type GetContactArgs = z.infer<typeof getContactInputSchema>;

export async function get_contact(args: GetContactArgs, deps: { apollo: ApolloClient }) {
  const c = await deps.apollo.getContact(args.contact_id);

  const sequences = (c.contact_campaign_statuses ?? []).map((s) => ({
    sequence_id: s.emailer_campaign_id ?? null,
    sequence_name: s.emailer_campaign_name ?? null,
  }));

  const result = {
    id: c.id,
    name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
    title: c.title ?? null,
    company: c.organization?.name ?? null,
    email: c.email ?? null,
    linkedin_url: c.linkedin_url ?? null,
    city: c.city ?? null,
    state: c.state ?? null,
    country: c.country ?? null,
    seniority: c.seniority ?? null,
    departments: c.departments ?? [],
    sequences,
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
  };
}
