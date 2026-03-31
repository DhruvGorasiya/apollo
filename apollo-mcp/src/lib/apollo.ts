export type ApolloSearchContact = {
  id: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  organization_name?: string | null;
  title?: string | null;
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

const DEFAULT_APOLLO_API_BASE_URL = 'https://api.apollo.io/api/v1';

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

  async searchContacts(qKeywords: string, page = 1, perPage = 5): Promise<ApolloSearchContact[]> {
    const payload = { q_keywords: qKeywords, page, per_page: perPage };
    const json = await this.request<{ contacts?: ApolloSearchContact[] }>('/contacts/search', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return json.contacts ?? [];
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

