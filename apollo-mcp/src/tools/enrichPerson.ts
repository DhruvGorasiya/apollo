import { z } from 'zod';
import type { ApolloClient } from '../lib/apollo.js';

export const enrichPersonInputSchema = z.object({
  first_name: z.string().describe('First name of the person'),
  last_name: z.string().describe('Last name of the person'),
  organization_name: z.string().describe('Current employer name'),
  domain: z.string().optional().describe('Company email domain, e.g. "uber.com"'),
  linkedin_url: z.string().optional().describe('Full LinkedIn profile URL'),
});

export type EnrichPersonArgs = z.infer<typeof enrichPersonInputSchema>;

export async function enrich_person(args: EnrichPersonArgs, deps: { apollo: ApolloClient }) {
  const result = await deps.apollo.enrichPerson({
    first_name: args.first_name,
    last_name: args.last_name,
    organization_name: args.organization_name,
    ...(args.domain !== undefined && { domain: args.domain }),
    ...(args.linkedin_url !== undefined && { linkedin_url: args.linkedin_url }),
  });

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
