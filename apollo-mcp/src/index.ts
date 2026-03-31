import dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ApolloClient } from './lib/apollo.js';

import { find_contact_id, findContactIdInputSchema } from './tools/findContactId.js';
import { update_contact_custom_fields, updateContactCustomFieldsInputSchema } from './tools/updateCustomFields.js';
import { personalize_contact, personalizeContactInputSchema } from './tools/personalizeContact.js';
import { enroll_contact, enrollContactInputSchema } from './tools/enrollContact.js';
import { run_outreach_pipeline, runOutreachPipelineInputSchema } from './tools/runPipeline.js';

// Claude Desktop MCP expects the server to write only MCP JSON-RPC traffic to stdout.
// Disable dotenv logs (they break MCP JSON-RPC parsing).
dotenv.config({ debug: false, quiet: true });

const apolloApiKey = process.env.APOLLO_API_KEY;
if (!apolloApiKey) {
  throw new Error('Missing required environment variable: APOLLO_API_KEY');
}

const server = new McpServer(
  {
    name: 'apollo-custom',
    version: '1.0.0',
  },
  {
    capabilities: {
      // Enables client visibility into long-running tool calls.
      logging: {},
    },
  },
);

const apollo = new ApolloClient({ apiKey: apolloApiKey });

server.registerTool('find_contact_id', {
  description: 'Narrowly find an Apollo contact_id using name/company and optional email (not a bulk search).',
  inputSchema: findContactIdInputSchema,
}, async (args) => {
  return find_contact_id(args, { apollo });
});

server.registerTool('update_contact_custom_fields', {
  description: 'Write values into Apollo typed_custom_fields on a contact (by custom field name).',
  inputSchema: updateContactCustomFieldsInputSchema,
}, async (args) => {
  return update_contact_custom_fields(args, { apollo });
});

server.registerTool('personalize_contact', {
  description: 'Generate personalized subject + intro for a contact and write them to Apollo custom fields.',
  inputSchema: personalizeContactInputSchema,
}, async (args) => {
  return personalize_contact(args, { apollo });
});

server.registerTool('enroll_contact', {
  description: 'Add a contact to a configured Apollo sequence using a configured email account.',
  inputSchema: enrollContactInputSchema,
}, async (args) => {
  return enroll_contact(args, { apollo });
});

server.registerTool('run_outreach_pipeline', {
  description: 'Generate subject+intro, optionally write to Apollo, and optionally enroll into the Apollo sequence.',
  inputSchema: runOutreachPipelineInputSchema,
}, async (args) => {
  return run_outreach_pipeline(args, { apollo });
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('MCP server error:', error);
  process.exit(1);
});

