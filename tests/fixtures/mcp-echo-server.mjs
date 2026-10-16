/**
 * MCP fixtures: a minimal echo MCP server (newline-delimited JSON-RPC over
 * stdio) for the P11 acceptance test.
 */
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id === undefined || typeof msg.id !== 'number') return;
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'echo-server', version: '1.0.0' } } });
  } else if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: [
          {
            name: 'echo',
            description: 'Echoes the provided text back',
            inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
          },
        ],
      },
    });
  } else if (msg.method === 'tools/call') {
    send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `ECHO:${msg.params?.arguments?.text ?? ''}` }] } });
  }
});
