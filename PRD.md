# PRD: Custom Apollo MCP Server for AI-Powered Cold Outreach

## Overview

Build a local MCP server that plugs into Claude Desktop and enables an end-to-end AI-powered cold outreach pipeline. The server exposes tools that Claude can call conversationally to find contacts, generate personalized email content, write that content back to Apollo's custom fields, and enroll contacts into sequences. The goal is zero-friction outreach where a single natural language instruction from the user triggers the full pipeline.

---

## Problem Statement

The hosted Apollo MCP server exposes only standard contact fields. It cannot write to Apollo's `typed_custom_fields`, which means Apollo sequence templates that use custom variables like `{{contact.personalized_subject}}` and `{{contact.personalized_intro}}` always render broken (highlighted red in previews, sent blank to recipients). There is no workaround via the hosted MCP.

Additionally, the hosted server has no awareness of the user's outreach strategy, target persona preferences, tone guidelines, or resume context. Every tool call is generic.

---

## Goals

- Enable Claude to write AI-generated personalized content to Apollo custom fields before enrolling a contact
- Support full pipeline execution from a single conversational prompt
- Keep all credentials and logic local, nothing hosted, nothing third-party beyond Apollo (Claude Desktop provides the LLM generation)
- Make it easy to add new tools over time (Notion sync, Apify triggers, etc.)

---

## Non-Goals

- Building a UI or dashboard
- Replacing Apollo's sequence editor (sequences are still built manually in Apollo)
- Automating sends without human approval (user always confirms before enrollment)

---

## Architecture

```
Claude Desktop
     |
     | (stdio transport)
     v
Custom MCP Server (Node.js, runs locally)
     |
     |--- Apollo REST API (contacts, sequences, custom fields)
|--- (LLM generation handled by Claude Desktop)
     |--- Notion API (optional: outreach tracker sync)
```

The server runs as a local Node.js process. Claude Desktop connects to it via stdio transport, configured in `~/Library/Application Support/Claude/claude_desktop_config.json`.

---

## Tech Stack

- **Runtime:** Node.js (v18+)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **HTTP client:** `axios` or native `fetch`
- **Environment:** `dotenv` for API keys
- **Language:** TypeScript preferred, JavaScript acceptable

---

## Environment Variables

```
APOLLO_API_KEY=
NOTION_API_KEY=           # optional
NOTION_DATABASE_ID=       # optional, outreach tracker
```

---

## Tools to Implement

### 1. `update_contact_custom_fields`

The core missing piece. Writes arbitrary key-value pairs to Apollo's `typed_custom_fields` on a contact.

**Inputs:**

- `contact_id` (string, required)
- `fields` (object, required): key-value pairs matching Apollo custom field names exactly

**What it does:**
Calls `PATCH https://api.apollo.io/v1/contacts/{contact_id}` with `{ typed_custom_fields: fields }` and the API key in the header.

**Example call:**

```json
{
  "contact_id": "69bc98934b863400199ea3cc",
  "fields": {
    "personalized_subject": "Quick note re: your ML infra at Stripe",
    "personalized_intro": "Saw your team is scaling the feature pipeline. I worked on similar infra at Weaviate."
  }
}
```

---

### 1.1. `find_contact_id`

The purpose of this tool is to turn a human-provided name/company (and optionally email) into Apollo `contact_id` values so the rest of the pipeline can operate on real contacts.

**Inputs:**

- `first_name` (string, required)
- `last_name` (string, required)
- `company` (string, required)
- `email` (string, optional): optional hint to prioritize exact matches

**What it does:**

Calls Apollo Search for Contacts endpoint using a narrow `q_keywords` derived from the inputs, and returns the best match `contact_id` plus basic fields for Claude to display/confirm.

---

### 2. `personalize_contact`

Writes `personalized_subject` and `personalized_intro` (provided by Claude Desktop) to Apollo via `update_contact_custom_fields`.

**Inputs:**

- `contact_id` (string, required)
- `personalized_subject` (string, required)
- `personalized_intro` (string, required)

**What it does:**

1. Calls `update_contact_custom_fields` to write the provided subject + intro values to Apollo `typed_custom_fields`.
2. Returns the written content for Claude to display in the conversation for review.

**Personalization prompt guidelines (provided to Claude Desktop; not executed by MCP code):**

- Subject: under 10 words, no "I" as first word, no "quick question", references something specific about them or their company
- Intro: 1-2 sentences max, leads with Weaviate credential, ties to their world specifically, no generic openers like "Hope this finds you well"

---

### 3. `enroll_contact`

Adds a contact to a specified Apollo sequence using a specified email account.

**Inputs:**

- `contact_id` (string, required)
- `sequence_id` (string, optional, defaults to the Engineering Manager Outreach sequence ID in env)
- `email_account_id` (string, optional, defaults to primary Gmail account ID in env)

**What it does:**
Calls the Apollo `add_contacts_to_sequence` endpoint. Returns enrollment status.

**Default values (set in `.env`):**

```
DEFAULT_SEQUENCE_ID=69bc7610c5ea080015ef897c
DEFAULT_EMAIL_ACCOUNT_ID=69bc6db12df826001d6ea2f4
```

---

### 4. `run_outreach_pipeline`

The top-level tool. Takes a contact plus Claude-provided `personalized_subject` + `personalized_intro`, writes them to Apollo, and enrolls the contact in the sequence in one shot.

**Inputs:**

- `contact_id` (string, required)
- `personalized_subject` (string, required)
- `personalized_intro` (string, required)
- `dry_run` (boolean, optional, default: false): if true, does not write to Apollo or enroll

**What it does:**

1. Writes the provided subject + intro via `update_contact_custom_fields` (same behavior as `personalize_contact`)
2. If `dry_run` is false, calls `enroll_contact`
3. Returns a summary of what was done

**The human approval gate lives in the conversation, not in this tool.** Claude should surface the generated content and ask for confirmation before calling this with `dry_run: false`. This is enforced via Claude's system instructions, not code.

---

### 5. `sync_to_notion` (optional, Phase 2)

Logs a completed outreach to the Notion outreach tracker database.

**Inputs:**

- `contact_id` (string)
- `first_name`, `last_name`, `title`, `company` (strings)
- `sequence_id` (string)
- `enrolled_at` (ISO datetime string)
- `status` (string, default: "Enrolled")

**What it does:**
Creates a new page in the Notion outreach tracker database (`2c209bd3-c91a-4f2b-b145-4b916f9d09c5`) with the contact details and enrollment status.

---

## File Structure

```
apollo-mcp/
├── src/
│   ├── index.ts           # MCP server entry point, tool registration
│   ├── tools/
│   │   ├── updateCustomFields.ts
│   │   ├── personalizeContact.ts
│   │   ├── enrollContact.ts
│   │   ├── runPipeline.ts
│   │   └── syncNotion.ts  # Phase 2
│   ├── lib/
│   │   ├── apollo.ts      # Apollo REST API client
│   │   ├── anthropic.ts   # (optional/legacy) Anthropic API client
│   │   └── notion.ts      # Notion client (Phase 2)
│   └── prompts/
│       └── personalize.ts # (optional/legacy) Personalization prompt templates
├── .env
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Claude Desktop Config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apollo-custom": {
      "command": "node",
      "args": ["/path/to/apollo-mcp/dist/index.js"],
      "env": {
        "APOLLO_API_KEY": "your_key_here",
        "DEFAULT_SEQUENCE_ID": "69bc7610c5ea080015ef897c",
        "DEFAULT_EMAIL_ACCOUNT_ID": "69bc6db12df826001d6ea2f4"
      }
    }
  }
}
```

---

## Example Conversation Flow (Post-Build)

```
User: Run outreach for John Smith, Engineering Manager at Stripe,
      headline says he leads the ML platform team.

Claude: [calls run_outreach_pipeline with dry_run: true, personalized_subject: (generated), personalized_intro: (generated)]
        Generated content:
        Subject: "Quick note re: ML platform at Stripe"
        Intro: "I built hybrid search infra at Weaviate and saw your team
                is scaling the ML platform. Think there's a relevant angle here."

        Look good? I'll enroll him in the Engineering Manager Outreach sequence.

User: Yes go ahead.

Claude: [calls run_outreach_pipeline with dry_run: false, personalized_subject: (generated), personalized_intro: (generated)]
        Done. John Smith enrolled. Step 1 fires within 30 minutes.
```

---

## Phase 1 Scope (Build This First)

- `find_contact_id`
- `update_contact_custom_fields`
- `personalize_contact`
- `enroll_contact`
- `run_outreach_pipeline` with dry run support
- `.env` config with default sequence and email account IDs
- README with setup instructions and Claude Desktop config snippet

## Phase 2 (After Validation)

- `sync_to_notion` tool
- Bulk pipeline support (run outreach for a list of contact IDs)
- Prompt versioning (A/B test different personalization styles)
- Per-company research hook (fetch recent news or job posts before personalizing)
