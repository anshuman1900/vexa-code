// Minimal safe markdown renderer (no innerHTML of untrusted content):
// fenced code, inline code, bold, italic, headings, lists, links.
// Text nodes only — XSS-safe by construction.
export function renderMarkdown(root: HTMLElement, md: string): void {
  root.textContent = '';
  const lines = md.split('\n');
  let i = 0;
  let para: string[] = [];
  const flushPara = (): void => {
    if (para.length === 0) return;
    const p = document.createElement('p');
    p.style.margin = '0 0 6px';
    renderInline(p, para.join(' '));
    root.append(p);
    para = [];
  };
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.startsWith('```')) {
      flushPara();
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        code.push(lines[i] ?? '');
        i++;
      }
      i++; // closing fence
      const pre = document.createElement('pre');
      pre.style.cssText = 'background:#14151f;border:1px solid #32344a;border-radius:8px;padding:8px 10px;overflow-x:auto;font:12px/1.5 Consolas,monospace;margin:6px 0;';
      pre.textContent = code.join('\n');
      root.append(pre);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h !== null) {
      flushPara();
      const heading = document.createElement('strong');
      heading.style.cssText = 'display:block;margin:8px 0 4px;font-size:1.05em;';
      renderInline(heading, h[2] ?? '');
      root.append(heading);
      i++;
      continue;
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li !== null) {
      flushPara();
      const item = document.createElement('div');
      item.style.cssText = 'margin:0 0 3px 14px;';
      item.textContent = '• ';
      renderInline(item, li[1] ?? '');
      root.append(item);
      i++;
      continue;
    }
    if (line.trim() === '') { flushPara(); i++; continue; }
    para.push(line);
    i++;
  }
  flushPara();
}

function renderInline(target: HTMLElement, text: string): void {
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) target.append(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      const b = document.createElement('b');
      b.textContent = tok.slice(2, -2);
      target.append(b);
    } else if (tok.startsWith('`')) {
      const c = document.createElement('code');
      c.style.cssText = 'background:#14151f;border:1px solid #32344a;border-radius:4px;padding:0 4px;font:12px Consolas,monospace;';
      c.textContent = tok.slice(1, -1);
      target.append(c);
    } else {
      const it = document.createElement('i');
      it.textContent = tok.slice(1, -1);
      target.append(it);
    }
    last = (m.index ?? 0) + tok.length;
  }
  if (last < text.length) target.append(text.slice(last));
}
