import { z } from 'zod';
import type { ApolloClient } from '../lib/apollo.js';

export const findContactIdInputSchema = z.object({
  first_name: z.string().describe('First name to search'),
  last_name: z.string().describe('Last name to search'),
  company: z.string().describe('Company name to narrow the search'),
  email: z.string().optional().describe('Optional email to prioritize exact match'),
});

export type FindContactIdArgs = z.infer<typeof findContactIdInputSchema>;

function scoreContact(args: FindContactIdArgs, c: { id: string; email?: string | null; first_name?: string | null; last_name?: string | null; name?: string | null; organization_name?: string | null }) {
  const emailInput = args.email?.trim().toLowerCase();
  const emailMatch = emailInput && c.email?.trim().toLowerCase() === emailInput;
  if (emailMatch) return 1000;

  const firstMatch =
    args.first_name.trim().toLowerCase() === (c.first_name ?? '').trim().toLowerCase() ||
    args.first_name.trim().toLowerCase() === ((c.name ?? '').split(' ')[0] ?? '').trim().toLowerCase();
  const lastMatch =
    args.last_name.trim().toLowerCase() === (c.last_name ?? '').trim().toLowerCase() ||
    args.last_name.trim().toLowerCase() === ((c.name ?? '').split(' ').slice(-1)[0] ?? '').trim().toLowerCase();
  const companyInput = args.company.trim().toLowerCase();
  const companyMatch = companyInput === (c.organization_name ?? '').trim().toLowerCase();

  let score = 0;
  if (firstMatch) score += 200;
  if (lastMatch) score += 200;
  if (companyMatch) score += 150;
  if (c.email) score += 10;

  return score;
}

export async function find_contact_id(args: FindContactIdArgs, deps: { apollo: ApolloClient }) {
  const keywords = [args.email?.trim(), args.first_name.trim(), args.last_name.trim(), args.company.trim()].filter(Boolean).join(' ');

  const contacts = await deps.apollo.searchContacts(keywords, 1, 5);
  if (!contacts.length) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'No Apollo contacts matched the narrow lookup filters. Try providing a more specific email or adjust the company/name inputs.',
        },
      ],
    };
  }

  const best = contacts
    .map((c) => ({ c, score: scoreContact(args, c) }))
    .sort((a, b) => b.score - a.score)[0];
  if (!best) {
    throw new Error('No Apollo contact candidates found for scoring');
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            contact_id: best.c.id,
            name: best.c.name ?? `${best.c.first_name ?? ''} ${best.c.last_name ?? ''}`.trim(),
            email: best.c.email ?? null,
            organization_name: best.c.organization_name ?? null,
            match_score: best.score,
          },
          null,
          2,
        ),
      },
    ],
    structuredContent: {
      contact_id: best.c.id,
      match_score: best.score,
    },
  };
}

