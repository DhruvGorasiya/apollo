export type ApolloContactDetail = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  organization?: { name?: string | null } | null;
  email?: string | null;
  linkedin_url?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  seniority?: string | null;
  departments?: string[] | null;
  contact_campaign_statuses?: Array<{ id?: string | null; emailer_campaign_id?: string | null; emailer_campaign_name?: string | null }> | null;
};

export type TypedCustomField = {
  id: string;
  name: string;
  type?: string;
  picklist_values?: Array<{
    id: string;
    name?: string;
    key?: string;
  }>;
};

export type ApolloCustomFieldMap = Map<string, TypedCustomField>; // key = lowercased custom field name

type ApolloClientOptions = {
  apiKey: string;
  apiBaseUrl?: string;
};

type EnrichPersonInput = {
  first_name: string;
  last_name: string;
  organization_name: string;
  domain?: string;
  linkedin_url?: string;
};

type EnrichPersonResult = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  apollo_id: string | null;
};

type ApolloPerson = {
  id?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  organization_name?: string | null;
};

const DEFAULT_APOLLO_API_BASE_URL = 'https://api.apollo.io/api/v1';

// LinkedIn obfuscated profile IDs (ACw... format) can't be resolved by Apollo.
// Passing them causes a match failure; omitting them lets Apollo fall back to name+domain.
function isObfuscatedLinkedInUrl(url: string): boolean {
  return /\/in\/ACw/i.test(url);
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase();
}

function extractJsonResponse<T>(json: unknown): T {
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (obj.value && typeof obj.value === 'string') {
      // Some Apollo docs wrap the data in a stringified JSON blob under `value`.
      try {
        return JSON.parse(obj.value as string) as T;
      } catch {
        // Fall through and just return as-is.
      }
    }
  }
  return json as T;
}

function toEnrichResult(person: ApolloPerson | null | undefined): EnrichPersonResult {
  return {
    email: person?.email ?? null,
    first_name: person?.first_name ?? null,
    last_name: person?.last_name ?? null,
    organization_name: person?.organization_name ?? null,
    apollo_id: person?.id ?? null,
  };
}

export class ApolloClient {
  private apiKey: string;
  private apiBaseUrl: string;
  private typedCustomFieldsByName?: ApolloCustomFieldMap;

  constructor(options: ApolloClientOptions) {
    this.apiKey = options.apiKey;
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_APOLLO_API_BASE_URL;
  }

  private async request<T>(path: string, init: RequestInit & { responseType?: 'json' } = {}): Promise<T> {
    const res = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      let payload: unknown = undefined;
      try {
        payload = await res.json();
      } catch {
        payload = await res.text().catch(() => undefined);
      }
      const message =
        typeof payload === 'object' && payload && 'error' in payload
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (payload as any).error
          : `Apollo request failed (${res.status})`;
      throw new Error(`${message}`);
    }

    // Apollo always returns JSON for our endpoints.
    const json = (await res.json()) as unknown;
    return extractJsonResponse<T>(json);
  }

  private async getTypedCustomFields(): Promise<TypedCustomField[]> {
    const json = await this.request<{ typed_custom_fields?: TypedCustomField[]; value?: unknown }>('/typed_custom_fields', {
      method: 'GET',
    });
    if (json.typed_custom_fields) return json.typed_custom_fields;

    // Fallback: some docs wrap payload, so attempt to locate.
    const maybe = json.value as { typed_custom_fields?: TypedCustomField[] } | undefined;
    if (maybe?.typed_custom_fields) return maybe.typed_custom_fields;

    throw new Error('Apollo returned no typed_custom_fields');
  }

  private async ensureTypedCustomFieldsByName(): Promise<ApolloCustomFieldMap> {
    if (this.typedCustomFieldsByName) return this.typedCustomFieldsByName;
    const list = await this.getTypedCustomFields();
    const map: ApolloCustomFieldMap = new Map();
    for (const field of list) {
      if (!field?.id || !field?.name) continue;
      map.set(normalizeKey(field.name), field);
    }
    this.typedCustomFieldsByName = map;
    return map;
  }

  async updateContactCustomFields(contactId: string, fieldsByName: Record<string, string>): Promise<unknown> {
    const customFieldMap = await this.ensureTypedCustomFieldsByName();

    const typed_custom_fields: Record<string, string> = {};

    for (const [fieldName, fieldValue] of Object.entries(fieldsByName)) {
      const key = normalizeKey(fieldName);
      const def = customFieldMap.get(key);
      if (!def) {
        throw new Error(`Unknown Apollo custom field name: ${fieldName}`);
      }

      const fieldType = (def.type ?? '').toLowerCase();
      if (fieldType === 'picklist') {
        const valueNorm = fieldValue.trim().toLowerCase();
        const options = def.picklist_values ?? [];
        const match =
          options.find((o) => (o.name ?? '').trim().toLowerCase() === valueNorm) ??
          options.find((o) => (o.key ?? '').trim().toLowerCase() === valueNorm) ??
          options.find((o) => o.id.trim().toLowerCase() === valueNorm);
        typed_custom_fields[def.id] = match?.id ?? fieldValue;
      } else {
        typed_custom_fields[def.id] = fieldValue;
      }
    }

    return this.request(`/contacts/${encodeURIComponent(contactId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ typed_custom_fields }),
    });
  }

  async enrichPerson(input: EnrichPersonInput): Promise<EnrichPersonResult> {
    const body: Record<string, unknown> = {
      first_name: input.first_name,
      last_name: input.last_name,
      organization_name: input.organization_name,
      reveal_personal_emails: false,
      reveal_phone_number: false,
    };
    if (input.domain) body.domain = input.domain;
    if (input.linkedin_url && !isObfuscatedLinkedInUrl(input.linkedin_url)) body.linkedin_url = input.linkedin_url;

    try {
      const json = await this.request<{ person?: ApolloPerson | null }>('/people/match', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return toEnrichResult(json.person);
    } catch {
      return { email: null, first_name: null, last_name: null, organization_name: null, apollo_id: null };
    }
  }

  async bulkEnrichPeople(people: EnrichPersonInput[]): Promise<EnrichPersonResult[]> {
    const details = people.map((p) => {
      const entry: Record<string, unknown> = {
        first_name: p.first_name,
        last_name: p.last_name,
        organization_name: p.organization_name,
      };
      if (p.domain) entry.domain = p.domain;
      if (p.linkedin_url && !isObfuscatedLinkedInUrl(p.linkedin_url)) entry.linkedin_url = p.linkedin_url;
      return entry;
    });

    const json = await this.request<{ matches?: Array<{ person?: ApolloPerson | null }> }>('/people/bulk_match', {
      method: 'POST',
      body: JSON.stringify({
        details,
        reveal_personal_emails: false,
        reveal_phone_number: false,
      }),
    });

    const matches = json.matches ?? [];
    // Return one result per input, padding with nulls if Apollo returns fewer.
    return people.map((_, i) => toEnrichResult(matches[i]?.person));
  }

  async getContact(contactId: string): Promise<ApolloContactDetail> {
    const json = await this.request<{ contact?: ApolloContactDetail }>(`/contacts/${encodeURIComponent(contactId)}`, {
      method: 'GET',
    });
    if (!json.contact) {
      throw new Error(`Apollo returned no contact for id: ${contactId}`);
    }
    return json.contact;
  }

  async addContactsToSequence(args: {
    contactId: string;
    sequenceId: string;
    emailAccountId: string;
  }): Promise<unknown> {
    const params = new URLSearchParams({
      emailer_campaign_id: args.sequenceId,
      send_email_from_email_account_id: args.emailAccountId,
    });
    params.append('contact_ids[]', args.contactId);

    return this.request(`/emailer_campaigns/${encodeURIComponent(args.sequenceId)}/add_contact_ids?${params.toString()}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }
}
