// Vexa Code GUI — talks to the `vexa --gui` sidecar over line-JSON.
import { invoke, Channel } from '@tauri-apps/api/core';
import { renderMarkdown } from './markdown';

const chat = document.getElementById('chat') as HTMLElement;
const input = document.getElementById('input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const modelLabel = document.getElementById('model-label') as HTMLElement;
const cwdLabel = document.getElementById('cwd-label') as HTMLElement;
const permBar = document.getElementById('permission-bar') as HTMLElement;
const permText = document.getElementById('permission-text') as HTMLElement;
const permAllow = document.getElementById('perm-allow') as HTMLButtonElement;
const permDeny = document.getElementById('perm-deny') as HTMLButtonElement;

let permissionId: string | null = null;
let streamingEl: HTMLElement | null = null;
let streamingText = '';

function el(tag: string, cls?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function addMessage(role: 'user' | 'assistant', text: string): HTMLElement {
  const wrap = el('div', `msg ${role}`);
  const who = el('div', 'who');
  who.textContent = role === 'user' ? 'you' : 'vexa';
  const bubble = el('div', 'bubble');
  bubble.textContent = text;
  wrap.append(who, bubble);
  chat.append(wrap);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

function toolSummary(name: string, input: Record<string, unknown> | null): string {
  if (input === null) return '';
  const keys = ['command', 'file_path', 'pattern', 'url', 'query', 'description', 'path'];
  for (const k of keys) {
    const v = input[k];
    if (typeof v === 'string' && v !== '') return v.replace(/\s+/g, ' ').slice(0, 120);
  }
  return '';
}

function addToolCard(name: string, input: Record<string, unknown> | null, isError: boolean): HTMLElement {
  const card = el('details', `tool-card${isError ? ' error' : ''}`);
  const summary = el('summary');
  const chev = el('span', 'chev'); chev.textContent = '▸';
  const nm = el('span', 'tname'); nm.textContent = name;
  const sum = el('span', 'tsum'); sum.textContent = toolSummary(name, input);
  summary.append(chev, nm, sum);
  card.append(summary);
  const body = el('div', 'tbody');
  if (input !== null && Object.keys(input).length > 0) {
    if (name === 'Edit' && typeof input['old_string'] === 'string' && typeof input['new_string'] === 'string') {
      for (const l of (input['old_string'] as string).split('\n')) {
        const d = el('div', 'diff-line del'); d.textContent = '- ' + l; body.append(d);
      }
      for (const l of (input['new_string'] as string).split('\n')) {
        const d = el('div', 'diff-line add'); d.textContent = '+ ' + l; body.append(d);
      }
    } else {
      const pre = el('pre', 'json');
      pre.textContent = JSON.stringify(input, null, 2).slice(0, 2000);
      body.append(pre);
    }
  }
  card.append(body);
  summary.addEventListener('click', () => { chev.textContent = card.open ? '▾' : '▸'; });
  chat.append(card);
  scrollIfSticky();
  return card;
}

let pendingCard: HTMLElement | null = null;

const welcome = document.getElementById('welcome') as HTMLElement;
const newSessionBtn = document.getElementById('new-session') as HTMLButtonElement;
let turnStart = 0;
let spinnerTimer: ReturnType<typeof setInterval> | null = null;

function setSpinner(on: boolean): void {
  if (spinnerTimer !== null) { clearInterval(spinnerTimer); spinnerTimer = null; }
  if (on) {
    turnStart = Date.now();
    modelLabel.textContent = `${modelLabel.textContent ?? ''} …`;
    spinnerTimer = setInterval(() => {
      const secs = ((Date.now() - turnStart) / 1000).toFixed(0);
      const base = modelLabel.textContent?.replace(/ · \d+s$/, '').replace(/ …$/, '') ?? '';
      modelLabel.textContent = `${base} … · ${secs}s`;
    }, 1000);
  } else {
    modelLabel.textContent = (modelLabel.textContent ?? '').replace(/ · \d+s$/, '').replace(/ …$/, '');
  }
}

function nearBottom(): boolean {
  return chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
}
function scrollIfSticky(force = false): void {
  if (force || nearBottom()) chat.scrollTop = chat.scrollHeight;
}

newSessionBtn.addEventListener('click', () => {
  chat.textContent = '';
  chat.append(welcome);
  welcome.style.display = '';
  streamingEl = null;
  void invoke('bridge_write', { data: JSON.stringify({ type: 'new_session' }) + '\n' });
});

const channel = new Channel<string>();
channel.onmessage = (line: string) => {
  let ev: Record<string, unknown>;
  try { ev = JSON.parse(line); } catch { return; }
  switch (ev['type']) {
    case 'ready': {
      setSpinner(false);
      modelLabel.textContent = `${String(ev['provider'])}:${String(ev['model'])}`;
      cwdLabel.textContent = String(ev['cwd'] ?? '');
      break;
    }
    case 'assistant_delta': {
      welcome.style.display = 'none';
      if (streamingEl === null) {
        streamingText = '';
        streamingEl = addMessage('assistant', '');
      }
      streamingText += String(ev['text'] ?? '');
      renderMarkdown(streamingEl, streamingText);
      scrollIfSticky();
      break;
    }
    case 'assistant_message': {
      if (streamingEl !== null) { renderMarkdown(streamingEl, String(ev['text'] ?? '')); streamingEl = null; }
      else {
        const b = addMessage('assistant', '');
        renderMarkdown(b, String(ev['text'] ?? ''));
      }
      break;
    }
    case 'tool_use': {
      welcome.style.display = 'none';
      pendingCard = addToolCard(String(ev['name'] ?? 'tool'), (ev['input'] ?? null) as Record<string, unknown> | null, false);
      break;
    }
    case 'tool_result': {
      welcome.style.display = 'none';
      const card = pendingCard ?? addToolCard(String(ev['name'] ?? 'tool'), null, ev['isError'] === true);
      pendingCard = null;
      if (ev['isError'] === true) card.classList.add('error');
      const sum = card.querySelector('.tsum');
      if (sum !== null) sum.textContent = String(ev['content'] ?? '').replace(/\s+/g, ' ').slice(0, 120);
      break;
    }
    case 'permission_request': {
      permissionId = String(ev['id'] ?? '');
      permText.textContent = `${String(ev['tool'])} wants to run: ${JSON.stringify(ev['input']).slice(0, 240)}`;
      permBar.classList.remove('hidden');
      break;
    }
    case 'turn_end': {
      streamingEl = null;
      setSpinner(false);
      const u = ev['usage'] as { inputTokens?: number; outputTokens?: number } | null;
      if (u !== null && u !== undefined) {
        const meta = el('div', 'who');
        meta.textContent = `in=${u.inputTokens ?? '?'} out=${u.outputTokens ?? '?'}`;
        chat.append(meta);
      }
      sendBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      input.disabled = false;
      input.focus();
      scrollIfSticky(true);
      break;
    }
    case 'error': {
      addToolLine('error', String(ev['message'] ?? 'unknown'), true);
      break;
    }
  }
};

function send(): void {
  const text = input.value.trim();
  if (text === '') return;
  welcome.style.display = 'none';
  addMessage('user', text);
  setSpinner(true);
  input.value = '';
  input.disabled = true;
  sendBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');
  streamingEl = null;
  void invoke('bridge_write', { data: JSON.stringify({ type: 'user_message', text }) + '\n' });
}

sendBtn.addEventListener('click', send);
stopBtn.addEventListener('click', () => {
  void invoke('bridge_write', { data: JSON.stringify({ type: 'interrupt' }) + '\n' });
});
input.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
permAllow.addEventListener('click', () => {
  if (permissionId !== null) void invoke('bridge_write', { data: JSON.stringify({ type: 'permission_response', id: permissionId, allow: true }) + '\n' });
  permissionId = null; permBar.classList.add('hidden');
});
permDeny.addEventListener('click', () => {
  if (permissionId !== null) void invoke('bridge_write', { data: JSON.stringify({ type: 'permission_response', id: permissionId, allow: false }) + '\n' });
  permissionId = null; permBar.classList.add('hidden');
});

void invoke('bridge_start', { channel });
