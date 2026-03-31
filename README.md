# Apollo MCP Server (Local)

This repo contains a local Node/TypeScript MCP server that lets Claude Desktop run an Apollo cold-outreach pipeline end-to-end:

- `find_contact_id` (narrow lookup: name/company + optional email)
- `update_contact_custom_fields`
- `personalize_contact` (Claude-generated subject + intro written to Apollo custom fields)
- `enroll_contact` (enroll a contact into an Apollo sequence)
- `run_outreach_pipeline` (write provided personalization; optionally write + enroll)

## Setup

1. Install Node dependencies:
   - `cd apollo-mcp`
   - `npm install`

2. Configure environment:
   - Copy `.env.example` to `.env`
   - Set `APOLLO_API_KEY`
   - Set `DEFAULT_SEQUENCE_ID` and `DEFAULT_EMAIL_ACCOUNT_ID` (used by `enroll_contact` / `run_outreach_pipeline`)

## Build + run

- Build: `npm run build`
- Run (from repo root): `node apollo-mcp/dist/index.js`

## Claude Desktop MCP (stdio)

Add a local MCP server entry that runs the built server over stdio (example):

```json
{
  "mcpServers": {
    "apollo-custom": {
      "command": "node",
      "args": ["./apollo-mcp/dist/index.js"],
      "env": {
        "APOLLO_API_KEY": "your_key_here",
        "DEFAULT_SEQUENCE_ID": "69bc7610c5ea080015ef897c",
        "DEFAULT_EMAIL_ACCOUNT_ID": "69bc6db12df826001d6ea2f4"
      }
    }
  }
}
```

Note: the server reads env vars via `dotenv`, so you can also rely on your local `.env` file.
