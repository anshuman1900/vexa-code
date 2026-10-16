/**
 * MCP stdio client (SPEC §6 P11 / [CX §4.2-4.4]): JSON-RPC 2.0 over
 * newline-delimited stdio. initialize handshake → tools/list → tools/call.
 */
import { spawn, type ChildProcess } from 'node:child_process';

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class McpClient {
  private child: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = '';
  public serverInfo: { name?: string; version?: string } = {};
  public status: 'disconnected' | 'connected' | 'failed' = 'disconnected';

  constructor(
    public readonly serverName: string,
    private readonly cfg: McpServerConfig,
  ) {}

  async start(): Promise<void> {
    this.child = spawn(this.cfg.command, this.cfg.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(this.cfg.env ?? {}) },
      windowsHide: true,
    });
    this.status = 'connected';
    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      let nl: number;
      while ((nl = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (line === '') continue;
        try {
          this.handleLine(JSON.parse(line));
        } catch {
          // malformed line — skip (P25 behavior)
        }
      }
    });
    this.child.stderr?.on('data', () => {}); // servers log to stderr; ignored
    this.child.on('exit', () => {
      this.status = 'disconnected';
      for (const [id, p] of this.pending) {
        p.reject(new Error(`MCP server "${this.serverName}" exited`));
        this.pending.delete(id);
      }
    });
    const info = (await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'vexa-code', version: '0.1.0' },
    })) as { serverInfo?: { name?: string; version?: string } } | undefined;
    this.serverInfo = info?.serverInfo ?? {};
    this.notify('notifications/initialized');
  }

  private handleLine(msg: { id?: number; result?: unknown; error?: { message?: string }; method?: string }): void {
    if (msg.id === undefined || typeof msg.id !== 'number') return; // notification
    const p = this.pending.get(msg.id);
    if (p === undefined) return;
    this.pending.delete(msg.id);
    if (msg.error !== undefined) p.reject(new Error(msg.error.message ?? 'MCP error'));
    else p.resolve(msg.result);
  }

  private async request(method: string, params: unknown, timeoutMs = 15_000): Promise<unknown> {
    if (this.child === null) throw new Error(`MCP server "${this.serverName}" not started`);
    const id = this.nextId++;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    const p = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request ${method} timed out (${this.serverName})`));
        }
      }, timeoutMs);
    });
    this.child.stdin?.write(msg);
    return p;
  }

  private notify(method: string): void {
    this.child?.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method, params: {} }) + '\n');
  }

  async listTools(): Promise<McpToolDef[]> {
    const result = (await this.request('tools/list', {})) as { tools?: McpToolDef[] };
    return result?.tools ?? [];
  }

  async callTool(name: string, args: unknown): Promise<{ text: string; isError: boolean }> {
    const result = (await this.request('tools/call', { name, arguments: args ?? {} })) as {
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    const text = (result?.content ?? [])
      .filter((c) => c.type === 'text' || typeof c.text === 'string')
      .map((c) => c.text ?? '')
      .join('\n');
    return { text: text === '' ? '(empty result)' : text, isError: result?.isError === true };
  }

  stop(): void {
    if (this.child !== null && this.status === 'connected') {
      this.child.kill();
    }
    this.status = 'disconnected';
  }
}
