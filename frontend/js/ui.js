import { initials } from './format.js';

const ICONS = {
  dashboard: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16',
  members:
    'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 19v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  assets: 'M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9ZM4 7.5 12 12m0 0 8-4.5M12 12v9',
  loans: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5v-15ZM19 18v3H6.5',
  reports: 'M5 21V10m7 11V3m7 18v-7',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.4-3a8.4 8.4 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a8.3 8.3 0 0 0-2.2-1.3L15.4 2h-4l-.4 2.5c-.8.3-1.5.7-2.2 1.3l-2.3-1-2 3.4 2 1.5a8.4 8.4 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-1c.7.6 1.4 1 2.2 1.3l.4 2.5h4l.4-2.5c.8-.3 1.5-.7 2.2-1.3l2.3 1 2-3.4-2-1.5c.06-.43.1-.86.1-1.3Z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.5-1.5L21 21',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 13l4 4L19 7',
  alert:
    'M12 8v5m0 3.5v.5M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  refresh: 'M20 11a8 8 0 1 0-.6 4M20 5v6h-6',
  print: 'M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7v-7Z',
  trash: 'M4 7h16M10 11v6m4-6v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3',
  back: 'M19 12H5m0 0 6-6m-6 6 6 6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3.5 2',
  box: 'M3 9h18M9 21V9M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
};

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function icon(name, size = 18) {
  const d = ICONS[name] ?? ICONS.box;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

export function avatar(name, large = false) {
  return `<span class="avatar${large ? ' lg' : ''}">${esc(initials(name))}</span>`;
}

export function badge(text, tone = 'neutral', dot = false) {
  return `<span class="badge ${tone}">${dot ? '<span class="dot"></span>' : ''}${esc(text)}</span>`;
}

export function notice(message, tone = 'info') {
  return `<div class="notice ${tone}">${esc(message)}</div>`;
}

export function emptyState({ title, description, action = '' }) {
  return `<div class="empty"><div class="empty-title">${esc(title)}</div><p class="small">${esc(description)}</p>${action}</div>`;
}

export function skeleton(rows = 4, columns = 4) {
  const cells = Array.from({ length: rows * columns }, () => '<div class="skeleton" style="height:14px;margin:12px 18px"></div>').join('');
  return `<div>${cells}</div>`;
}

export function btn(
  label,
  { variant = '', size = '', act, href, type = 'button', disabled = false, iconName, extra = '', block = false } = {},
) {
  const cls = ['btn', variant, size, block ? 'block' : ''].filter(Boolean).join(' ');
  const inner = `${iconName ? icon(iconName, 16) : ''}${label}`;
  if (href) return `<a class="${cls}" href="${href}" ${extra}>${inner}</a>`;
  return `<button class="${cls}" type="${type}" ${act ? `data-act="${act}"` : ''} ${disabled ? 'disabled' : ''} ${extra}>${inner}</button>`;
}

/** One listener per event type on an element. Replaces the previous handler so re-renders do not stack. */
export function on(el, type, fn) {
  if (!el) return;
  el._aborts ??= {};
  el._aborts[type]?.abort();
  const ac = new AbortController();
  el._aborts[type] = ac;
  el.addEventListener(type, fn, { signal: ac.signal });
}

export function searchInput(value, placeholder, name = 'q') {
  return `<div class="search"><span class="icon">${icon('search', 16)}</span><input type="search" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></div>`;
}

export function field(label, control, { hint = '', error = '', span = false } = {}) {
  return `<div class="field${span ? ' span-2' : ''}"><label>${esc(label)}</label>${control}${error ? `<span class="error">${esc(error)}</span>` : hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`;
}

export function select(name, value, options) {
  return `<select name="${name}">${options
    .map((opt) => `<option value="${esc(opt.value)}" ${String(opt.value) === String(value) ? 'selected' : ''}>${esc(opt.label)}</option>`)
    .join('')}</select>`;
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

let toastId = 0;
export function toast(message, tone = 'info') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    document.body.appendChild(stack);
  }
  const id = ++toastId;
  const el = document.createElement('div');
  el.className = `toast ${tone === 'info' ? '' : tone}`;
  el.innerHTML = `<span class="grow">${esc(message)}</span><button type="button" aria-label="Dismiss">×</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  stack.appendChild(el);
  setTimeout(() => el.remove(), 5000);
  return id;
}

export function toastFail(error) {
  if (error?.status === 401) return;
  const details = error?.fieldErrors ? Object.values(error.fieldErrors).filter(Boolean) : [];
  const extra = details.length ? ` ${details.join(' ')}` : '';
  toast((error instanceof Error ? error.message : 'Something went wrong.') + extra, 'error');
}

export function closeModals() {
  document.querySelectorAll('.overlay').forEach((el) => el.remove());
}

export function openModal({ title, body, footer, wide = false }) {
  closeModals();
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="btn ghost sm" type="button" data-close>${icon('close', 16)}</button></div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot">${footer}</div>
  </div>`;
  const close = () => overlay.remove();
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('[data-close]')) close();
  });
  document.body.appendChild(overlay);
  overlay.querySelector('input, select, textarea, button')?.focus();
  return { overlay, close, bodyEl: overlay.querySelector('.modal-body'), footEl: overlay.querySelector('.modal-foot') };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', destructive = false }) {
  return new Promise((resolve) => {
    const { overlay, close } = openModal({
      title,
      body: `<p class="small">${message}</p>`,
      footer: `${btn('Cancel', { extra: 'data-cancel' })}${btn(confirmLabel, { variant: destructive ? 'danger' : 'primary', extra: 'data-ok' })}`,
    });
    overlay.addEventListener('click', (event) => {
      if (event.target.closest('[data-ok]')) {
        close();
        resolve(true);
      } else if (event.target.closest('[data-cancel]') || event.target === overlay || event.target.closest('[data-close]')) {
        close();
        resolve(false);
      }
    });
  });
}

export async function qrImg(value, size, alt) {
  try {
    const url = await window.QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
      color: { dark: '#14201dff', light: '#ffffffff' },
    });
    return `<img src="${url}" width="${size}" height="${size}" alt="${esc(alt)}">`;
  } catch {
    return `<div class="skeleton" style="width:${size}px;height:${size}px;border-radius:8px"></div>`;
  }
}

export function statCard(label, value, { tone = '', hint = '', iconName } = {}) {
  return `<div class="card stat ${tone}">
    <div class="label">${iconName ? icon(iconName, 14) : ''}${esc(label)}</div>
    <div class="value">${esc(value)}</div>
    ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}
  </div>`;
}

export function pageHead(title, subtitle, actions = '') {
  return `<div class="page-head"><div><h1>${title}</h1>${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}</div><div class="btn-group">${actions}</div></div>`;
}

export function card(inner, { title, actions = '', bodyClass = 'card-body' } = {}) {
  if (title) {
    return `<div class="card"><div class="card-head"><h3>${title}</h3>${actions}</div><div class="${bodyClass}">${inner}</div></div>`;
  }
  return `<div class="card"><div class="${bodyClass}">${inner}</div></div>`;
}
