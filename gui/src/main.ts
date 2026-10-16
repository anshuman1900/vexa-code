// Vexa Code GUI — talks to the `vexa --gui` sidecar over line-JSON.
import { invoke, Channel } from '@tauri-apps/api/core';

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

function addToolLine(name: string, detail: string, isError: boolean): void {
  const t = el('div', `tool${isError ? ' error' : ''}`);
  const b = el('b'); b.textContent = name;
  t.append(b, document.createTextNode(' ' + detail.slice(0, 300)));
  chat.append(t);
  chat.scrollTop = chat.scrollHeight;
}

const channel = new Channel<string>();
channel.onmessage = (line: string) => {
  let ev: Record<string, unknown>;
  try { ev = JSON.parse(line); } catch { return; }
  switch (ev['type']) {
    case 'ready': {
      modelLabel.textContent = `${String(ev['provider'])}:${String(ev['model'])}`;
      cwdLabel.textContent = String(ev['cwd'] ?? '');
      break;
    }
    case 'assistant_delta': {
      if (streamingEl === null) {
        streamingText = '';
        streamingEl = addMessage('assistant', '');
      }
      streamingText += String(ev['text'] ?? '');
      streamingEl.textContent = streamingText;
      chat.scrollTop = chat.scrollHeight;
      break;
    }
    case 'assistant_message': {
      if (streamingEl !== null) { streamingEl.textContent = String(ev['text'] ?? ''); streamingEl = null; }
      else addMessage('assistant', String(ev['text'] ?? ''));
      break;
    }
    case 'tool_result': {
      addToolLine(String(ev['name'] ?? 'tool'), String(ev['content'] ?? ''), ev['isError'] === true);
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
      sendBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      input.disabled = false;
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
  addMessage('user', text);
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
