// Vexa GUI — Claude-look frontend. Talks to the `vexa --gui` sidecar.
import { invoke, Channel } from '@tauri-apps/api/core';
import { renderMarkdown } from './markdown';

// ---------- dom ----------
const chatScroll = document.getElementById('chat-scroll') as HTMLElement;
const column = document.getElementById('column') as HTMLElement;
const welcome = document.getElementById('welcome') as HTMLElement;
const input = document.getElementById('input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const modelLabel = document.getElementById('model-label') as HTMLElement;
const sessionList = document.getElementById('session-list') as HTMLElement;
const newChatBtn = document.getElementById('new-chat') as HTMLButtonElement;
const newSessionBtn = document.getElementById('new-session') as HTMLButtonElement;
const permBar = document.getElementById('permission-bar') as HTMLElement;
const permText = document.getElementById('permission-text') as HTMLElement;
const permAllow = document.getElementById('perm-allow') as HTMLButtonElement;
const permDeny = document.getElementById('perm-deny') as HTMLButtonElement;

// ---------- state ----------
let permissionId: string | null = null;
let streamingEl: HTMLElement | null = null;
let streamingText = '';
let spinnerTimer: ReturnType<typeof setInterval> | null = null;
let turnStart = 0;
let currentSessionId: string | null = null;

// ---------- helpers ----------
function el(tag: string, cls?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
function nearBottom(): boolean {
  return chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 90;
}
function scrollIfSticky(force = false): void {
  if (force || nearBottom()) chatScroll.scrollTop = chatScroll.scrollHeight;
}
function hideWelcome(): void {
  if (welcome.style.display !== 'none') welcome.style.display = 'none';
}
function setSpinner(on: boolean): void {
  if (spinnerTimer !== null) { clearInterval(spinnerTimer); spinnerTimer = null; }
  if (on) {
    turnStart = Date.now();
    spinnerTimer = setInterval(() => {
      const base = modelLabel.textContent?.replace(/ · \d+s$/, '') ?? '';
      modelLabel.textContent = `${base} · ${((Date.now() - turnStart) / 1000).toFixed(0)}s`;
    }, 1000);
  } else {
    modelLabel.textContent = (modelLabel.textContent ?? '').replace(/ · \d+s$/, '');
  }
}

// ---------- messages (Claude style: labeled, user bubble / assistant plain) ----------
function addMessage(role: 'user' | 'assistant', text: string): HTMLElement {
  const wrap = el('div', `msg ${role}`);
  const who = el('div', 'who');
  if (role === 'assistant') {
    const star = el('span', 'star'); star.textContent = '✻';
    who.append(star, document.createTextNode('Vexa'));
  } else {
    who.textContent = 'You';
  }
  const bubble = el('div', 'bubble');
  if (role === 'user') bubble.textContent = text;
  else renderMarkdown(bubble, text);
  wrap.append(who, bubble);
  column.append(wrap);
  scrollIfSticky();
  return bubble;
}

// ---------- tool cards ----------
function toolSummary(input: Record<string, unknown> | null): string {
  if (input === null) return '';
  for (const k of ['command', 'file_path', 'pattern', 'url', 'query', 'description', 'path']) {
    const v = input[k];
    if (typeof v === 'string' && v !== '') return v.replace(/\s+/g, ' ').slice(0, 110);
  }
  return '';
}
function addToolCard(name: string, input: Record<string, unknown> | null, isError: boolean): HTMLElement {
  hideWelcome();
  const card = el('details', `tool-card${isError ? ' error' : ''}`);
  const summary = el('summary');
  const chev = el('span', 'chev'); chev.textContent = '▸';
  const nm = el('span', 'tname'); nm.textContent = name;
  const sum = el('span', 'tsum'); sum.textContent = toolSummary(input);
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
  summary.addEventListener('click', () => { chev.textContent = card.open ? '▸' : '▾'; });
  column.append(card);
  scrollIfSticky();
  return card;
}
let pendingCard: HTMLElement | null = null;

// ---------- sidebar sessions ----------
function renderSessions(sessions: Array<{ id: string; mtimeMs: number; msgCount: number; firstPrompt: string }>): void {
  sessionList.textContent = '';
  for (const s of sessions) {
    const item = el('div', 'session-item' + (s.id === currentSessionId ? ' active' : ''));
    item.textContent = s.firstPrompt !== '' ? s.firstPrompt : `Session ${s.id.slice(0, 8)}`;
    const when = el('span', 'when');
    when.textContent = new Date(s.mtimeMs).toLocaleDateString() + ' · ' + s.msgCount + ' msgs';
    item.append(when);
    item.addEventListener('click', () => {
      currentSessionId = s.id;
      openSession(s.id);
    });
    sessionList.append(item);
  }
}
function refreshSessions(): void {
  void invoke('bridge_write', { data: JSON.stringify({ type: 'list_sessions' }) + '\n' });
}
function openSession(id: string): void {
  // clear chat, replay history from sidecar
  column.textContent = '';
  welcome.style.display = 'none';
  streamingEl = null;
  void invoke('bridge_write', { data: JSON.stringify({ type: 'open_session', id }) + '\n' });
}
function clearChat(): void {
  column.textContent = '';
  column.append(welcome);
  welcome.style.display = '';
  streamingEl = null;
  currentSessionId = null;
}

// ---------- composer ----------
function setBusy(busy: boolean): void {
  input.disabled = false; // keep typing allowed, but swap send/stop
  sendBtn.classList.toggle('hidden', busy);
  stopBtn.classList.toggle('hidden', !busy);
}
function autoGrow(): void {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 180) + 'px';
}
function send(): void {
  const text = input.value.trim();
  if (text === '') return;
  hideWelcome();
  addMessage('user', text);
  input.value = '';
  autoGrow();
  setBusy(true);
  setSpinner(true);
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
input.addEventListener('input', autoGrow);
newChatBtn.addEventListener('click', () => {
  clearChat();
  setBusy(false);
  setSpinner(false);
  void invoke('bridge_write', { data: JSON.stringify({ type: 'new_session' }) + '\n' });
  refreshSessions();
});
newSessionBtn.addEventListener('click', () => { newChatBtn.click(); });

// ---------- permissions ----------
function resolvePermission(allow: boolean): void {
  if (permissionId !== null) {
    void invoke('bridge_write', { data: JSON.stringify({ type: 'permission_response', id: permissionId, allow }) + '\n' });
  }
  permissionId = null;
  permBar.classList.add('hidden');
}
permAllow.addEventListener('click', () => resolvePermission(true));
permDeny.addEventListener('click', () => resolvePermission(false));

// ---------- sidecar channel ----------
const channel = new Channel<string>();
channel.onmessage = (line: string) => {
  let ev: Record<string, unknown>;
  try { ev = JSON.parse(line); } catch { return; }
  switch (ev['type']) {
    case 'ready': {
      modelLabel.textContent = `${String(ev['provider'])} · ${String(ev['model']).split('/').pop()}`;
      refreshSessions();
      break;
    }
    case 'sessions': {
      renderSessions((ev['sessions'] ?? []) as Array<{ id: string; mtimeMs: number; msgCount: number; firstPrompt: string }>);
      break;
    }
    case 'session_opened': {
      currentSessionId = String(ev['session_id'] ?? '');
      refreshSessions();
      scrollIfSticky(true);
      break;
    }
    case 'history_message': {
      addMessage(ev['role'] === 'user' ? 'user' : 'assistant', String(ev['text'] ?? ''));
      break;
    }
    case 'assistant_delta': {
      hideWelcome();
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
      pendingCard = addToolCard(String(ev['name'] ?? 'tool'), (ev['input'] ?? null) as Record<string, unknown> | null, false);
      break;
    }
    case 'tool_result': {
      const card = pendingCard ?? addToolCard(String(ev['name'] ?? 'tool'), null, ev['isError'] === true);
      pendingCard = null;
      if (ev['isError'] === true) card.classList.add('error');
      const sum = card.querySelector('.tsum');
      if (sum !== null) sum.textContent = String(ev['content'] ?? '').replace(/\s+/g, ' ').slice(0, 110);
      break;
    }
    case 'permission_request': {
      permissionId = String(ev['id'] ?? '');
      permText.textContent = `${String(ev['tool'])} — ${JSON.stringify(ev['input']).slice(0, 220)}`;
      permBar.classList.remove('hidden');
      break;
    }
    case 'turn_end': {
      streamingEl = null;
      setSpinner(false);
      setBusy(false);
      const u = ev['usage'] as { inputTokens?: number; outputTokens?: number } | null;
      if (u !== null && u !== undefined) {
        const meta = el('div', 'usage-line');
        meta.textContent = `in ${u.inputTokens ?? '?'} · out ${u.outputTokens ?? '?'} tokens`;
        column.append(meta);
      }
      refreshSessions();
      scrollIfSticky(true);
      input.focus();
      break;
    }
    case 'error': {
      hideWelcome();
      const card = addToolCard('error', null, true);
      const sum = card.querySelector('.tsum');
      if (sum !== null) sum.textContent = String(ev['message'] ?? 'unknown');
      break;
    }
  }
};

// textarea Enter-to-send sizing
void invoke('bridge_start', { channel });
