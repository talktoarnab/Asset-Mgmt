import { api, ApiError, getConfig, loadConfig, logout, readOrg, readToken, writeOrg, writeToken } from './api.js';
import {
  STATUS_TONE,
  TIER_LIMITS,
  currency,
  dueLabel,
  formatDate,
  formatPhone,
  stockBadge,
  stockOf,
  titleCase,
  unitBadge,
  loanCode,
} from './format.js';
import {
  avatar,
  badge,
  btn,
  card,
  closeModals,
  confirmDialog,
  debounce,
  emptyState,
  esc,
  field,
  icon,
  notice,
  on,
  openModal,
  pageHead,
  qrImg,
  searchInput,
  select,
  skeleton,
  statCard,
  toast,
  toastFail,
} from './ui.js';

const CATEGORIES = [
  { value: 'book', label: 'Book' },
  { value: 'tool', label: 'Tool' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'device', label: 'Device' },
  { value: 'media', label: 'Media' },
  { value: 'other', label: 'Other' },
];

const ASSET_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'maintenance', label: 'In maintenance' },
  { value: 'lost', label: 'Lost' },
  { value: 'retired', label: 'Retired' },
];

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

const session = {
  me: null,
  overdueCount: 0,
};

function org() {
  return session.me?.org;
}

function tz() {
  return org()?.timezone ?? 'UTC';
}

function isAdmin() {
  return Boolean(session.me?.user?.roles?.includes('admin'));
}

function path() {
  const raw = location.hash.replace(/^#/, '') || '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function go(to) {
  const next = `#${to.startsWith('/') ? to : `/${to}`}`;
  if (location.hash === next) route();
  else location.hash = next;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function match(route) {
  const parts = path().split('/').filter(Boolean);
  const want = route.split('/').filter(Boolean);
  if (want.length !== parts.length) return null;
  const params = {};
  for (let i = 0; i < want.length; i += 1) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = decodeURIComponent(parts[i]);
    else if (want[i] !== parts[i]) return null;
  }
  return params;
}

async function refreshCounts() {
  try {
    const summary = await api.summary();
    session.overdueCount = summary.loans.overdue;
    const badgeEl = document.querySelector('[data-overdue-count]');
    if (badgeEl) {
      badgeEl.textContent = session.overdueCount || '';
      badgeEl.hidden = !session.overdueCount;
    }
  } catch {
    /* ignore */
  }
}

function navActive(href) {
  const current = path();
  if (href === '#/') return current === '/';
  const route = href.slice(1);
  return current === route || current.startsWith(`${route}/`);
}

function shellHtml() {
  const branch = org()?.name ?? 'ShelfKit';
  const items = [
    { href: '#/', label: 'Dashboard', short: 'Home', icon: 'dashboard' },
    { href: '#/scan', label: 'Desk', short: 'Desk', icon: 'scan' },
    { href: '#/loans', label: 'Loans', short: 'Loans', icon: 'loans', count: true },
    { href: '#/assets', label: 'Catalogue', short: 'Items', icon: 'assets' },
    { href: '#/members', label: 'Members', short: 'People', icon: 'members' },
  ];
  const secondary = [
    { href: '#/reports', label: 'Reports', short: 'Reports', icon: 'reports' },
    { href: '#/settings', label: 'Settings', short: 'Settings', icon: 'settings' },
  ];
  const link = (item) =>
    `<a class="nav-link${navActive(item.href) ? ' active' : ''}" href="${item.href}">${icon(item.icon, 17)}${esc(item.label)}${
      item.count
        ? `<span class="count" data-overdue-count ${session.overdueCount ? '' : 'hidden'}>${session.overdueCount || ''}</span>`
        : ''
    }</a>`;

  const current = [...items, ...secondary].find((item) => navActive(item.href));

  return `<div class="app">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">${icon('loans', 17)}</span><span class="col"><span>${esc(branch)}</span><span class="brand-sub">${esc(org()?.slug || org()?.orgId || 'ShelfKit')}</span></span></div>
      <nav>${items.map(link).join('')}<div class="nav-group-label">Insights</div>${secondary.map(link).join('')}</nav>
      <div class="sidebar-footer">
        ${avatar(session.me.user.name || 'Staff')}
        <div class="col grow"><span class="small strong truncate">${esc(session.me.user.name || 'Staff')}</span><span class="tiny muted">${isAdmin() ? 'Administrator' : 'Desk staff'}</span></div>
        <button class="btn ghost sm" type="button" data-act="logout" title="Sign out" aria-label="Sign out">${icon('logout', 16)}</button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <span class="brand-mark">${icon('loans', 16)}</span>
        <div class="col grow"><strong class="truncate">${esc(current?.label ?? branch)}</strong><span class="tiny muted truncate">${esc(branch)}</span></div>
        <button class="btn ghost sm" type="button" data-act="logout" aria-label="Sign out">${icon('logout', 16)}</button>
      </header>
      <main class="content" id="view"></main>
    </div>
    <nav class="bottom-nav">
      ${items
        .map(
          (item) =>
            `<a href="${item.href}" class="${navActive(item.href) ? 'active' : ''}">${icon(item.icon, 20)}${esc(item.short)}</a>`,
        )
        .join('')}
      <a href="#/reports" class="${navActive('#/reports') || navActive('#/settings') ? 'active' : ''}">${icon('reports', 20)}More</a>
    </nav>
  </div>`;
}

function bindShell(root) {
  on(root, 'click', (event) => {
    if (event.target.closest('[data-act="logout"]')) logout();
  });
}

function loanRows(loans, { showMember = true, showItem = true } = {}) {
  if (!loans.length) return emptyState({ title: 'Nothing here', description: 'No loans in this list.' });
  return `<div class="table-wrap"><table><thead><tr>
    ${showItem ? '<th>Item</th>' : ''}
    ${showMember ? '<th>Borrower</th>' : ''}
    <th>Due</th><th class="hide-sm">Taken</th><th class="right">Actions</th>
  </tr></thead><tbody>${loans
    .map((loan) => {
      const due = dueLabel(loan.dueAt, tz());
      return `<tr>
        ${
          showItem
            ? `<td><div class="col"><a class="strong" href="#/assets/${esc(loan.assetId)}">${esc(loan.assetTitle)}</a><span class="mono muted">${esc(loanCode(loan))}</span></div></td>`
            : ''
        }
        ${
          showMember
            ? `<td><div class="col"><a href="#/members/${esc(loan.memberId)}">${esc(loan.memberName)}</a><span class="tiny muted">${esc(formatPhone(loan.memberPhone))}</span></div></td>`
            : ''
        }
        <td><div class="col">${badge(due.text, due.tone, true)}<span class="tiny muted">${esc(formatDate(loan.dueAt, tz()))}</span></div></td>
        <td class="hide-sm small muted">${esc(formatDate(loan.checkedOutAt, tz()))}${loan.renewals > 0 ? ` · renewed ${loan.renewals}×` : ''}</td>
        <td class="right"><div class="btn-group" style="justify-content:flex-end">
          ${btn('Check in', { variant: 'primary', size: 'sm', extra: `data-loan="checkin" data-id="${esc(loan.checkoutId)}" data-title="${esc(loan.assetTitle)}" data-serial="${esc(loan.unitSerial || '')}"` })}
          ${btn('Renew', { size: 'sm', extra: `data-loan="renew" data-id="${esc(loan.checkoutId)}"` })}
          ${isAdmin() && due.overdue ? btn('Lost', { variant: 'ghost', size: 'sm', extra: `data-loan="lost" data-id="${esc(loan.checkoutId)}" data-title="${esc(loan.assetTitle)}" data-member="${esc(loan.memberName)}"` }) : ''}
        </div></td>
      </tr>`;
    })
    .join('')}</tbody></table></div>`;
}

async function handleLoanAction(event, onChanged) {
  const el = event.target.closest('[data-loan]');
  if (!el) return;
  const id = el.dataset.id;
  const action = el.dataset.loan;
  try {
    if (action === 'checkin') {
      await api.checkin(id);
        toast(`"${el.dataset.title}${el.dataset.serial ? ` (${el.dataset.serial})` : ''}" is back on the shelf.`, 'success');
    } else if (action === 'renew') {
      const renewed = await api.renew(id);
      toast(`Renewed until ${formatDate(renewed.dueAt, tz())}.`, 'success');
    } else if (action === 'lost') {
      const ok = await confirmDialog({
        title: 'Mark this item as lost?',
        message: `<strong>${esc(el.dataset.title)}</strong> will be removed from circulation and counted in shrinkage reports. The loan against ${esc(el.dataset.member)} will be closed.`,
        confirmLabel: 'Mark as lost',
        destructive: true,
      });
      if (!ok) return;
      await api.markLost(id);
      toast(`"${el.dataset.title}" recorded as lost.`, 'success');
    }
    await onChanged();
  } catch (error) {
    toastFail(error);
  }
}

function assetPayload(form, editing) {
  const data = Object.fromEntries(new FormData(form).entries());
  const payload = { title: data.title.trim(), category: data.category };
  if (data.creator?.trim()) payload.creator = data.creator.trim();
  if (data.identifier?.trim()) payload.identifier = data.identifier.trim();
  if (data.location?.trim()) payload.location = data.location.trim();
  if (data.replacementCost?.trim()) payload.replacementCost = Number(data.replacementCost);
  if (data.code?.trim()) payload.code = data.code.trim().toUpperCase();
  if (data.stock?.trim()) payload.stock = Number(data.stock);
  if (editing) payload.status = data.status;
  return payload;
}

function assetFormBody(draft, editing, errors = {}) {
  return `<form class="form-grid" id="asset-form">
    ${field('Title', `<input name="title" value="${esc(draft.title)}" placeholder="e.g. Sapiens, or Bosch Impact Drill" required>`, { span: true, error: errors.title })}
    ${field('Category', select('category', draft.category, CATEGORIES))}
    ${field('Author / maker', `<input name="creator" value="${esc(draft.creator)}">`, { error: errors.creator })}
    ${field('ISBN / product serial', `<input name="identifier" value="${esc(draft.identifier)}">`, { hint: 'ISBN or manufacturer serial for the product — not the warehouse unit ID', error: errors.identifier })}
    ${field('Shelf or location', `<input name="location" value="${esc(draft.location)}" placeholder="A2, Tool wall, Locker 1">`, { error: errors.location })}
    ${field('Replacement cost', `<input name="replacementCost" type="number" min="0" value="${esc(draft.replacementCost)}">`, { hint: 'Used for shrinkage reporting', error: errors.replacementCost })}
    ${editing ? field('Status', select('status', draft.status, ASSET_STATUSES)) : ''}
    ${field('SKU', `<input name="code" value="${esc(draft.code)}" placeholder="BK-4F2A9C">`, { hint: editing ? 'Product code. Unit labels stay as they were printed.' : 'Leave blank to generate one. Each copy then gets SKU-001, SKU-002, …', error: errors.code })}
    ${field('How many units', `<input name="stock" type="number" min="1" max="200" value="${esc(draft.stock || '1')}">`, { hint: editing ? 'Adds or removes identified units. Cannot go below copies currently on loan.' : 'Each physical copy gets its own serial, like a warehouse.', error: errors.stock })}
  </form>`;
}

function openAssetForm({ title, submitLabel, draft, editing, onSubmit }) {
  const { overlay, close, bodyEl } = openModal({
    title,
    body: assetFormBody(draft, editing),
    footer: `${btn('Cancel', { extra: 'data-close' })}${btn(submitLabel, { variant: 'primary', extra: 'data-save' })}`,
  });
  overlay.addEventListener('click', async (event) => {
    if (!event.target.closest('[data-save]')) return;
    const form = bodyEl.querySelector('form');
    try {
      await onSubmit(assetPayload(form, editing));
      close();
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        bodyEl.innerHTML = assetFormBody(Object.fromEntries(new FormData(form).entries()), editing, error.fieldErrors);
      } else {
        toastFail(error);
      }
    }
  });
}

function memberPayload(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const payload = {
    name: data.name.trim(),
    phone: data.phone.trim(),
    tier: data.tier,
    status: data.status || 'active',
    whatsappOptIn: true,
  };
  if (data.email?.trim()) payload.email = data.email.trim();
  if (data.borrowLimit?.trim()) payload.borrowLimit = Number(data.borrowLimit);
  if (data.membershipExpiresAt) payload.membershipExpiresAt = new Date(`${data.membershipExpiresAt}T23:59:59Z`).toISOString();
  if (data.notes?.trim()) payload.notes = data.notes.trim();
  return payload;
}

function memberFormBody(draft, editing, errors = {}) {
  const tiers = Object.entries(TIER_LIMITS).map(([tier, limit]) => ({
    value: tier,
    label: `${titleCase(tier)} — ${limit} items`,
  }));
  return `<form class="form-grid" id="member-form">
    ${field('Full name', `<input name="name" value="${esc(draft.name)}" placeholder="Ananya Sharma" required>`, { error: errors.name })}
    ${field('Mobile number', `<input name="phone" type="tel" value="${esc(draft.phone)}" placeholder="98765 43210">`, { hint: 'Reminders are sent here', error: errors.phone })}
    ${field('Email (optional)', `<input name="email" type="email" value="${esc(draft.email)}">`, { error: errors.email })}
    ${field('Membership tier', select('tier', draft.tier, tiers))}
    ${field('Borrow limit override', `<input name="borrowLimit" type="number" min="0" value="${esc(draft.borrowLimit)}">`, { hint: 'Leave blank to use the tier limit', error: errors.borrowLimit })}
    ${field('Membership valid until', `<input name="membershipExpiresAt" type="date" value="${esc(draft.membershipExpiresAt)}">`, { hint: 'Optional' })}
    ${editing ? field('Status', select('status', draft.status, [{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }])) : `<input type="hidden" name="status" value="active">`}
    ${field('Notes', `<textarea name="notes" rows="3" placeholder="Anything the desk should know">${esc(draft.notes)}</textarea>`, { span: true })}
  </form>`;
}

function openMemberForm({ title, submitLabel, draft, editing, onSubmit }) {
  const { overlay, close, bodyEl } = openModal({
    title,
    body: memberFormBody(draft, editing),
    footer: `${btn('Cancel', { extra: 'data-close' })}${btn(submitLabel, { variant: 'primary', extra: 'data-save' })}`,
  });
  overlay.addEventListener('click', async (event) => {
    if (!event.target.closest('[data-save]')) return;
    const form = bodyEl.querySelector('form');
    const data = Object.fromEntries(new FormData(form).entries());
    const local = {};
    if (!data.name.trim()) local.name = 'A name is required';
    if (!data.phone.trim()) local.phone = 'A phone number is required';
    if (Object.keys(local).length) {
      bodyEl.innerHTML = memberFormBody(data, editing, local);
      return;
    }
    try {
      await onSubmit(memberPayload(form));
      close();
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        bodyEl.innerHTML = memberFormBody(Object.fromEntries(new FormData(form).entries()), editing, error.fieldErrors);
      } else {
        toastFail(error);
      }
    }
  });
}

function emptyAssetDraft() {
  return { title: '', category: 'book', creator: '', identifier: '', location: '', replacementCost: '', status: 'available', code: '', stock: '1' };
}

function emptyMemberDraft() {
  return { name: '', phone: '', email: '', tier: 'standard', borrowLimit: '', status: 'active', membershipExpiresAt: '', notes: '' };
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

async function renderSignIn(root) {
  const config = getConfig();
  const fromHash = path().match(/^\/o\/([a-z][a-z0-9-]{2,31})$/i);
  let mode = 'signin';
  let orgSlug = (fromHash?.[1] || readOrg()).toLowerCase();
  let orgName = '';
  let slugTouched = Boolean(orgSlug);

  function paint(errorMessage) {
    root.innerHTML = `<div class="login-screen"><div class="card login-card">
      <span class="brand-mark">${icon('loans', 22)}</span>
      <h1>${esc(config.appName)}</h1>
      <p class="muted small" style="margin-top:8px;margin-bottom:24px">${
        mode === 'setup'
          ? 'Open a desk for your library or tool room. Catalogue, members and loans stay on this branch.'
          : 'Sign in to your branch. A handheld scanner types barcodes into the desk after you unlock.'
      }</p>
      <form class="stack" style="gap:14px;text-align:left" id="login-form">
        ${
          mode === 'setup'
            ? `${field('Desk name', `<input name="name" value="${esc(orgName)}" placeholder="Kanchan Community Library" required autofocus>`)}
               ${field('Branch ID', `<input name="org" value="${esc(orgSlug)}" placeholder="kanchan" autocapitalize="off" spellcheck="false" required>`, { hint: 'Staff type this at sign-in. Letters, numbers and dashes.' })}`
            : field(
                'Branch ID',
                `<input name="org" value="${esc(orgSlug)}" placeholder="kanchan" autocapitalize="off" spellcheck="false" required autofocus>`,
                { hint: orgName ? orgName : 'The short ID for this desk' },
              )
        }
        ${field('Staff PIN', '<input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required>')}
        ${mode === 'setup' ? field('Confirm PIN', '<input name="pinConfirm" type="password" inputmode="numeric" autocomplete="new-password" required>') : ''}
        ${errorMessage ? `<span class="error">${esc(errorMessage)}</span>` : ''}
        ${btn(mode === 'setup' ? 'Create this desk' : 'Unlock the desk', { variant: 'primary', size: 'lg', type: 'submit', block: true })}
      </form>
      <p class="tiny muted" style="margin-top:18px">${
        mode === 'setup'
          ? `<button class="btn ghost sm" type="button" data-act="signin">Already have a desk? Sign in</button>`
          : `<button class="btn ghost sm" type="button" data-act="setup">First time here? Open a desk</button>`
      }</p>
    </div></div>`;
    const form = root.querySelector('#login-form');
    const submit = form.querySelector('button[type="submit"]');
    form.querySelector('[name="name"]')?.addEventListener('input', (event) => {
      orgName = event.target.value;
      if (!slugTouched) {
        orgSlug = slugify(orgName);
        const slugInput = form.querySelector('[name="org"]');
        if (slugInput) slugInput.value = orgSlug;
      }
    });
    form.querySelector('[name="org"]')?.addEventListener('input', (event) => {
      orgSlug = event.target.value.trim().toLowerCase();
      slugTouched = true;
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const org = (data.org || '').trim().toLowerCase();
      const pin = (data.pin || '').trim();
      if (!org || !pin) return;
      if (mode === 'setup') {
        if (pin !== (data.pinConfirm || '').trim()) {
          paint('The PIN and confirmation do not match.');
          return;
        }
      }
      submit.disabled = true;
      try {
        const result =
          mode === 'setup'
            ? await api.createOrg({ slug: org, name: data.name.trim(), pin })
            : await api.login(org, pin);
        writeToken(result.token);
        writeOrg(result.org?.slug || result.org?.orgId || org);
        location.hash = '#/';
        await boot();
      } catch (error) {
        paint(error.message);
      }
    });
    on(root, 'click', (event) => {
      if (event.target.closest('[data-act="setup"]')) {
        mode = 'setup';
        paint();
      }
      if (event.target.closest('[data-act="signin"]')) {
        mode = 'signin';
        paint();
      }
    });
  }

  paint();
  if (orgSlug && mode === 'signin') {
    api.lookupOrg(orgSlug)
      .then((found) => {
        orgName = found.name;
        paint();
      })
      .catch(() => {});
  }
}

async function renderDashboard(view) {
  view.innerHTML = pageHead(greeting(), 'Loading today’s position…', `${btn('', { iconName: 'refresh', extra: 'data-act="reload"' })}${btn('Open desk', { variant: 'primary', iconName: 'scan', href: '#/scan' })}`) + skeleton();
  let summary;
  let loans;
  try {
    [summary, loans] = await Promise.all([api.summary(), api.listCheckouts('open').then((r) => r.items)]);
  } catch (error) {
    view.innerHTML = notice(error.message, 'danger');
    return;
  }
  const overdue = loans.filter((loan) => dueLabel(loan.dueAt, tz()).overdue);
  const dueSoon = loans.filter((loan) => {
    const label = dueLabel(loan.dueAt, tz());
    return !label.overdue && label.days <= 2;
  });
  const branch = org();
  view.innerHTML = `
    ${pageHead(
      greeting(),
      `${summary.loans.open} item${summary.loans.open === 1 ? '' : 's'} out on loan across ${summary.assets.total} catalogued item${summary.assets.total === 1 ? '' : 's'}.`,
      `${btn('<span class="hide-sm">Refresh</span>', { iconName: 'refresh', extra: 'data-act="reload"' })}${btn('Open desk', { variant: 'primary', iconName: 'scan', href: '#/scan' })}`,
    )}
    <div class="stack">
      <div class="grid grid-stats">
        ${statCard('Overdue', summary.loans.overdue, { iconName: 'alert', tone: summary.loans.overdue > 0 ? 'danger' : '', hint: summary.loans.overdue ? 'Needs a nudge today' : 'Everything is on time' })}
        ${statCard('Due today', summary.loans.dueToday, { iconName: 'clock', tone: summary.loans.dueToday > 0 ? 'warning' : '', hint: `${summary.loans.dueSoon} more in the next 3 days` })}
        ${statCard('Out on loan', summary.loans.open, { iconName: 'loans', hint: `${summary.assets.utilisationPct}% of the catalogue` })}
        ${statCard('Available now', summary.assets.available, { iconName: 'box', tone: 'positive', hint: `${summary.members.active} active members` })}
      </div>
      ${card(overdue.length ? loanRows(overdue.slice(0, 8)) : emptyState({ title: 'Nothing here', description: 'No overdue items. Chase returns from the loans list when something is late.' }), { title: `Overdue${overdue.length ? ` (${overdue.length})` : ''}`, actions: overdue.length ? '<a class="small" href="#/loans">View all loans</a>' : '', bodyClass: '' })}
      <div class="grid grid-2">
        ${card(
          dueSoon.length
            ? `<div style="padding:6px 18px 14px">${dueSoon
                .slice(0, 6)
                .map((loan) => {
                  const due = dueLabel(loan.dueAt, tz());
                  return `<div class="row-between" style="padding:9px 0;border-bottom:1px solid var(--line)"><div class="col grow"><a class="small strong truncate" href="#/assets/${esc(loan.assetId)}">${esc(loan.assetTitle)}</a><span class="tiny muted truncate">${esc(loan.memberName)}${loan.unitSerial ? ` · ${esc(loan.unitSerial)}` : ''} · ${esc(formatDate(loan.dueAt, tz()))}</span></div>${badge(due.text, due.tone)}</div>`;
                })
                .join('')}</div>`
            : emptyState({ title: 'Nothing due imminently', description: 'These loans are due within two days.' }),
          { title: 'Due in the next couple of days', bodyClass: '' },
        )}
        ${card(
          `<div class="stack" style="gap:12px">
            <div class="row-between small"><span class="muted">Loan period</span><span class="strong">${branch.defaultLoanDays} days</span></div>
            <div class="row-between small"><span class="muted">Renewals allowed</span><span class="strong">${branch.maxRenewals === 0 ? 'None' : `${branch.maxRenewals} × ${branch.renewalDays} days`}</span></div>
            <div class="row-between small"><span class="muted">Timezone</span><span class="strong">${esc(branch.timezone)}</span></div>
            <div class="row-between small"><span class="muted">Checkouts (30 days)</span><span class="strong">${summary.loans.checkoutsLast30Days}</span></div>
            <div class="row-between small"><span class="muted">Reported lost</span><span class="strong">${summary.shrinkage.lostAssets} item(s)</span></div>
            <div class="btn-group" style="margin-top:4px">${btn('Print labels', { size: 'sm', iconName: 'print', href: '#/assets/labels' })}${btn('Full report', { size: 'sm', iconName: 'reports', href: '#/reports' })}</div>
          </div>`,
          { title: 'This branch' },
        )}
      </div>
    </div>`;
  on(view, 'click', (event) => {
    if (event.target.closest('[data-act="reload"]')) renderDashboard(view);
    handleLoanAction(event, () => {
      refreshCounts();
      return renderDashboard(view);
    });
  });
}

function unitPickerHtml(result, selectedUnitId) {
  if (result.unit) return '';
  const units = (result.asset?.units ?? []).filter((unit) => unit.status === 'available');
  if (!units.length) return '';
  if (units.length === 1 && selectedUnitId === units[0].unitId) {
    return card(
      `<div class="picked">${badge('On the shelf', 'positive', true)}<div class="col grow"><span class="small strong mono">${esc(units[0].serial)}</span><span class="tiny muted">This is the copy that will go out</span></div></div>`,
      { title: 'Unit' },
    );
  }
  return card(
    `<div class="member-list">${units
      .map(
        (unit) =>
          `<button class="member-option ${selectedUnitId === unit.unitId ? 'selected' : ''}" type="button" data-act="pick-unit" data-id="${esc(unit.unitId)}"><div class="col grow"><span class="small strong mono">${esc(unit.serial)}</span><span class="tiny muted">${esc(titleCase(unit.condition || 'good'))}</span></div>${selectedUnitId === unit.unitId ? badge('Selected', 'positive', true) : ''}</button>`,
      )
      .join('')}</div>`,
    { title: 'Which copy?' },
  );
}

async function renderScan(view) {
  const members = await api.listMembers().then((r) => r.items).catch((error) => {
    toastFail(error);
    return [];
  });
  let result;
  let memberId;
  let memberQuery = '';
  let selectedUnitId;

  function loanOptions() {
    const days = [...new Set([1, 3, 7, 14, 21, 30, org().defaultLoanDays])].sort((a, b) => a - b);
    return days.map((value) => ({
      value: String(value),
      label: `${value} day${value === 1 ? '' : 's'}${value === org().defaultLoanDays ? ' (branch default)' : ''}`,
    }));
  }

  function filteredMembers() {
    const term = memberQuery.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    if (!term) return members;
    return members.filter(
      (member) =>
        member.name.toLowerCase().includes(term) ||
        (digits.length >= 3 && member.phone.includes(digits)) ||
        (member.email ?? '').toLowerCase().includes(term),
    );
  }

  async function lookup(ref, withMember) {
    if (!ref.trim()) return;
    try {
      result = await api.scan(ref.trim(), withMember);
      if (result.unit?.unitId) selectedUnitId = result.unit.unitId;
      else if (!selectedUnitId) {
        const available = (result.asset?.units ?? []).filter((unit) => unit.status === 'available');
        if (available.length === 1) selectedUnitId = available[0].unitId;
      }
      if (result.suggestedAction === 'checkin' && !(stockOf(result.asset).available > 0)) memberId = undefined;
      paint();
    } catch (error) {
      result = undefined;
      toastFail(error);
      paint();
    }
  }

  function paint() {
    const selected = members.find((m) => m.memberId === memberId);
    const availableUnits = (result?.asset?.units ?? []).filter((unit) => unit.status === 'available');
    const unitReady = Boolean(result?.unit || selectedUnitId || availableUnits.length <= 1);
    view.innerHTML = `
      ${pageHead('Desk', 'Scan with a handheld reader, or type the code printed on the label, then lend or return.', result ? btn('Start over', { iconName: 'close', extra: 'data-act="reset"' }) : '')}
      <div class="scan-layout">
        ${card(`<form id="scan-form"><div class="field"><label for="manual-code">Scan or type a unit serial</label><div class="row"><input id="manual-code" class="grow scanner-wedge" name="ref" placeholder="Ready for handheld scanner" autocomplete="off" spellcheck="false" value="${esc(result?.unit?.serial ?? result?.asset?.code ?? '')}"><button class="btn" type="submit">Find</button></div><p class="tiny muted" style="margin-top:8px">Each copy has its own ID (SKU-001, SKU-002, …). Scanning a SKU lists the units on the shelf.</p></div></form>`)}
        <div class="stack" id="scan-result">
          ${
            !result
              ? card(`<div class="empty" style="padding:32px 16px">${icon('scan', 28)}<div class="empty-title">Waiting for a scan</div><p class="small">Point the handheld at a printed label. The item and its loan status appear here so you can check it out or take it back in one tap.</p></div>`)
              : `${card(`<div class="step done"><span class="n">${icon('check', 12)}</span>Item</div>
                  <div class="row-between" style="margin-top:12px;align-items:flex-start">
                    <div class="col grow"><a href="#/assets/${esc(result.asset.assetId)}"><h2>${esc(result.asset.title)}</h2></a>
                    <span class="small muted">${[result.asset.creator, titleCase(result.asset.category), result.asset.location].filter(Boolean).map(esc).join(' · ')}</span>
                    <span class="mono muted" style="margin-top:4px">${esc(result.unit?.serial || result.asset.sku || result.asset.code)}</span>
                    ${result.unit ? `<span class="tiny muted">${esc(unitBadge(result.unit).text)} · SKU ${esc(result.asset.sku || result.asset.code)}</span>` : ''}</div>
                    ${badge(stockBadge(result.asset).text, stockBadge(result.asset).tone, true)}
                  </div>`)}
                ${unitPickerHtml(result, selectedUnitId)}
                ${
                  (result.openCheckouts ?? (result.activeCheckout ? [result.activeCheckout] : []))
                    .length
                    ? card(
                        `${(result.openCheckouts ?? [result.activeCheckout]).map((loan) => {
                          const due = dueLabel(loan.dueAt, tz());
                          return `<div class="picked" style="margin-bottom:10px">${avatar(loan.memberName)}<div class="col grow"><a class="small strong" href="#/members/${esc(loan.memberId)}">${esc(loan.memberName)}</a><span class="tiny muted">${esc(formatPhone(loan.memberPhone))} · ${esc(loan.unitSerial || loan.assetCode)} · taken ${esc(formatDate(loan.checkedOutAt, tz()))}</span></div>${badge(due.text, due.tone, true)}${btn('Check in', { variant: 'primary', size: 'sm', extra: `data-act="checkin" data-id="${esc(loan.checkoutId)}"` })}</div>`;
                        }).join('')}
                         ${!(stockOf(result.asset).available > 0) ? btn('Check the oldest loan back in', { variant: 'ghost', size: 'sm', block: true, extra: 'data-act="checkin"' }) : ''}`,
                        { title: `${(result.openCheckouts ?? [result.activeCheckout]).length} on loan` },
                      )
                    : ''
                }
                ${
                  stockOf(result.asset).available > 0 && (!result.unit || result.unit.status === 'available')
                    ? card(`<div class="step ${memberId ? 'done' : ''}"><span class="n">${memberId ? icon('check', 12) : '2'}</span>Who is borrowing?</div>
                        ${
                          selected
                            ? `<div class="picked" style="margin-top:12px">${avatar(selected.name)}<div class="col grow"><span class="small strong">${esc(selected.name)}</span><span class="tiny muted">${esc(formatPhone(selected.phone))} · ${selected.openLoans} item(s) out</span></div>${btn('Change', { size: 'sm', variant: 'ghost', extra: 'data-act="clear-member"' })}</div>`
                            : `<div style="margin-top:12px">${searchInput(memberQuery, 'Search by name or phone')}<div class="member-list" style="margin-top:8px">${
                                filteredMembers().length === 0
                                  ? `<p class="small muted" style="padding:10px 4px">No members match “${esc(memberQuery)}”. <a href="#/members">Add a member</a></p>`
                                  : filteredMembers()
                                      .slice(0, 30)
                                      .map(
                                        (member) =>
                                          `<button class="member-option" type="button" data-act="pick-member" data-id="${esc(member.memberId)}">${avatar(member.name)}<div class="col grow"><span class="small strong truncate">${esc(member.name)}</span><span class="tiny muted">${esc(formatPhone(member.phone))} · ${member.openLoans} out</span></div>${badge(titleCase(member.tier), member.status === 'active' ? 'neutral' : 'danger')}</button>`,
                                      )
                                      .join('')
                              }</div></div>`
                        }
                        ${result.blockers.length ? `<div class="stack" style="gap:8px;margin-top:14px">${result.blockers.map((b) => notice(b.message, 'danger')).join('')}</div>` : ''}
                        ${
                          memberId
                            ? `<div style="margin-top:14px" class="stack">${!unitReady ? notice('Pick which copy is leaving the shelf.') : ''}${field('Loan period', select('loanDays', String(org().defaultLoanDays), loanOptions()))}${btn(`Check out to ${esc(selected?.name.split(' ')[0] ?? '')}`, { variant: 'primary', size: 'lg', block: true, extra: `data-act="checkout" ${result.blockers.length || !unitReady ? 'disabled' : ''}` })}</div>`
                            : ''
                        }`)
                    : ''
                }
                `
          }
        </div>
      </div>`;
    view.querySelector('#manual-code')?.focus();
    view.querySelector('#scan-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      lookup(new FormData(event.target).get('ref'));
    });
    view.querySelector('input[type="search"]')?.addEventListener(
      'input',
      debounce((event) => {
        memberQuery = event.target.value;
        paint();
        view.querySelector('input[type="search"]')?.focus();
      }, 150),
    );
    on(view, 'click', onClick);
  }

  async function onClick(event) {
    const el = event.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'reset') {
      result = undefined;
      memberId = undefined;
      memberQuery = '';
      selectedUnitId = undefined;
      paint();
    } else if (act === 'pick-unit') {
      selectedUnitId = el.dataset.id;
      paint();
    } else if (act === 'pick-member') {
      memberId = el.dataset.id;
      await lookup(result.unit?.serial || result.asset.assetId, memberId);
    } else if (act === 'clear-member') {
      memberId = undefined;
      paint();
    } else if (act === 'checkin') {
      try {
        if (el.dataset.id) await api.checkin(el.dataset.id);
        else await api.checkinByRef(result.unit?.serial || result.asset.assetId);
        toast(`"${result.unit?.serial || result.asset.title}" checked in. Thanks!`, 'success');
        result = undefined;
        memberId = undefined;
        selectedUnitId = undefined;
        refreshCounts();
        paint();
      } catch (error) {
        toastFail(error);
      }
    } else if (act === 'checkout') {
      const days = Number(view.querySelector('[name="loanDays"]')?.value) || undefined;
      try {
        const response = await api.checkout({
          assetRef: result.unit?.serial || result.asset.assetId,
          unitId: selectedUnitId || result.unit?.unitId,
          memberId,
          loanDays: days,
        });
        const serial = response.checkout.unitSerial || response.asset.title;
        toast(`${serial} → ${response.member.name}, due ${formatDate(response.checkout.dueAt, tz())}.`, 'success');
        result = undefined;
        memberId = undefined;
        memberQuery = '';
        selectedUnitId = undefined;
        refreshCounts();
        paint();
      } catch (error) {
        toastFail(error);
        lookup(result.unit?.serial || result.asset.assetId, memberId);
      }
    }
  }

  paint();
}

async function renderLoans(view) {
  let tab = 'overdue';
  let query = '';

  async function paint() {
    view.innerHTML = pageHead('Loans', 'Loading…', btn('Refresh', { iconName: 'refresh', extra: 'data-act="reload"' })) + skeleton();
    let open;
    let history;
    try {
      [open, history] = await Promise.all([
        api.listCheckouts('open').then((r) => r.items),
        api.listCheckouts('recent', 200).then((r) => r.items),
      ]);
    } catch (error) {
      view.innerHTML = notice(error.message, 'danger');
      return;
    }
    const term = query.trim().toLowerCase();
    const matches = (loan) =>
      !term ||
      loan.assetTitle.toLowerCase().includes(term) ||
      loan.memberName.toLowerCase().includes(term) ||
      loan.assetCode.toLowerCase().includes(term) ||
      (loan.unitSerial || '').toLowerCase().includes(term);
    const openLoans = open.filter(matches);
    const overdueLoans = openLoans.filter((loan) => dueLabel(loan.dueAt, tz()).overdue);
    const closed = history.filter((loan) => loan.status !== 'open').filter(matches);
    const shown = tab === 'overdue' ? overdueLoans : tab === 'open' ? openLoans : closed;
    view.innerHTML = `
      ${pageHead(overdueLoans.length > 0 ? 'Loans' : 'Loans', overdueLoans.length > 0 ? `${overdueLoans.length} item${overdueLoans.length === 1 ? '' : 's'} need chasing.` : 'Every borrowed item is within its loan period.', btn('Refresh', { iconName: 'refresh', extra: 'data-act="reload"' }))}
      <div class="stack">
        <div class="row wrap">
          <div class="segmented">
            <button type="button" class="${tab === 'overdue' ? 'active' : ''}" data-tab="overdue">Overdue (${overdueLoans.length})</button>
            <button type="button" class="${tab === 'open' ? 'active' : ''}" data-tab="open">On loan (${openLoans.length})</button>
            <button type="button" class="${tab === 'history' ? 'active' : ''}" data-tab="history">Returned</button>
          </div>
          ${searchInput(query, 'Filter by item, unit ID or borrower')}
        </div>
        ${card(
          tab === 'history'
            ? closed.length
              ? `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Borrower</th><th>Taken</th><th>Returned</th><th>Outcome</th></tr></thead><tbody>${closed
                  .map(
                    (loan) =>
                      `<tr><td><div class="col"><a class="strong" href="#/assets/${esc(loan.assetId)}">${esc(loan.assetTitle)}</a><span class="mono muted">${esc(loanCode(loan))}</span></div></td><td><a href="#/members/${esc(loan.memberId)}">${esc(loan.memberName)}</a></td><td class="small muted">${esc(formatDate(loan.checkedOutAt, tz()))}</td><td class="small muted">${esc(formatDate(loan.returnedAt, tz()))}</td><td>${badge(titleCase(loan.status), loan.status === 'returned' ? 'positive' : 'danger', true)}</td></tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : emptyState({ title: 'Nothing here', description: 'No completed loans yet.' })
            : shown.length
              ? loanRows(shown)
              : emptyState({
                  title: 'Nothing here',
                  description: tab === 'overdue' ? 'No overdue items right now.' : 'Nothing is on loan at the moment.',
                }),
          { bodyClass: '' },
        )}
      </div>`;
    view.querySelector('input[type="search"]')?.addEventListener(
      'input',
      debounce((event) => {
        query = event.target.value;
        paint();
      }, 200),
    );
    on(view, 'click', (event) => {
      const tabBtn = event.target.closest('[data-tab]');
      if (tabBtn) {
        tab = tabBtn.dataset.tab;
        paint();
        return;
      }
      if (event.target.closest('[data-act="reload"]')) paint();
      handleLoanAction(event, () => {
        refreshCounts();
        return paint();
      });
    });
  }

  await paint();
}

async function renderAssets(view) {
  let query = '';
  let status = '';
  let category = '';

  async function paint() {
    view.innerHTML = pageHead('Catalogue', 'Loading the catalogue…', '') + skeleton();
    let items = [];
    try {
      items = await api.listAssets({ q: query || undefined, status: status || undefined }).then((r) => r.items);
    } catch (error) {
      view.innerHTML = notice(error.message, 'danger');
      return;
    }
    const categories = [...new Set(items.map((a) => a.category))].sort();
    const shown = items.filter((asset) => !category || asset.category === category);
    view.innerHTML = `
      ${pageHead(
        'Catalogue',
        `${items.length} SKU${items.length === 1 ? '' : 's'} in the catalogue.`,
        `${btn('<span class="hide-sm">Print labels</span>', { iconName: 'print', href: '#/assets/labels' })}${btn('Add several', { extra: 'data-act="bulk"' })}${btn('Add item', { variant: 'primary', iconName: 'plus', extra: 'data-act="add"' })}`,
      )}
      <div class="stack">
        <div class="row wrap">
          ${searchInput(query, 'Search titles, SKUs, authors, shelves')}
          <div class="field hide-sm">${select('status', status, [
            { value: '', label: 'Any status' },
            { value: 'available', label: 'Available' },
            { value: 'checked_out', label: 'On loan' },
            { value: 'maintenance', label: 'Maintenance' },
            { value: 'lost', label: 'Lost' },
            { value: 'retired', label: 'Retired' },
          ])}</div>
          <div class="field hide-sm">${select('category', category, [{ value: '', label: 'All categories' }, ...categories.map((value) => ({ value, label: titleCase(value) }))])}</div>
        </div>
        ${card(
          shown.length === 0
            ? emptyState({
                title: query ? 'No items match your search' : 'The catalogue is empty',
                description: query ? 'Try a different title, code or shelf.' : 'Add your first book, tool or piece of equipment to start lending it out.',
                action: query ? '' : btn('Add the first item', { variant: 'primary', iconName: 'plus', extra: 'data-act="add"' }),
              })
            : `<div class="table-wrap"><table><thead><tr><th>Item</th><th class="hide-sm">SKU</th><th class="hide-sm">Category</th><th class="hide-sm">Shelf</th><th>Stock</th><th class="right hide-sm">Times out</th></tr></thead><tbody>${shown
                .map((asset) => {
                  const stock = stockBadge(asset);
                  return `<tr class="clickable" data-href="#/assets/${esc(asset.assetId)}"><td><div class="col"><a class="strong" href="#/assets/${esc(asset.assetId)}">${esc(asset.title)}</a><span class="tiny muted truncate">${asset.creator ? esc(asset.creator) : ''}</span></div></td><td class="hide-sm mono small muted">${esc(asset.sku || asset.code)}</td><td class="hide-sm small muted">${esc(titleCase(asset.category))}</td><td class="hide-sm small muted">${esc(asset.location ?? '—')}</td><td><div class="col">${badge(stock.text, stock.tone, true)}${stockOf(asset).onLoan ? `<span class="tiny muted">${stockOf(asset).onLoan} on loan</span>` : ''}</div></td><td class="right small muted hide-sm">${asset.timesBorrowed}</td></tr>`;
                })
                .join('')}</tbody></table></div>`,
          { bodyClass: '' },
        )}
      </div>`;
    view.querySelector('input[type="search"]')?.addEventListener(
      'input',
      debounce((event) => {
        query = event.target.value;
        paint();
      }, 250),
    );
    view.querySelector('[name="status"]')?.addEventListener('change', (event) => {
      status = event.target.value;
      paint();
    });
    view.querySelector('[name="category"]')?.addEventListener('change', (event) => {
      category = event.target.value;
      paint();
    });
    on(view,'click', (event) => {
      const row = event.target.closest('[data-href]');
      if (row && !event.target.closest('a,button')) go(row.dataset.href.slice(1));
      if (event.target.closest('[data-act="add"]')) {
        openAssetForm({
          title: 'Add an item',
          submitLabel: 'Add item',
          draft: emptyAssetDraft(),
          editing: false,
          onSubmit: async (payload) => {
            const asset = await api.createAsset(payload);
            toast(`"${asset.title}" added (${asset.sku || asset.code}, ${asset.stock} unit${asset.stock === 1 ? '' : 's'}).`, 'success');
            paint();
          },
        });
      }
      if (event.target.closest('[data-act="bulk"]')) openBulkAdd(paint);
    });
  }

  await paint();
}

function openBulkAdd(onDone) {
  const { overlay, close, bodyEl } = openModal({
    title: 'Add several items',
    body: `<div class="stack">${field('Category for all of these', select('category', 'book', CATEGORIES))}${field('One item per line', '<textarea name="text" rows="9" placeholder="Sapiens, Yuval Noah Harari&#10;Things Fall Apart, Chinua Achebe&#10;Clean Code"></textarea>', { hint: 'Optionally add the author or maker after a comma. Up to 200 lines. A title,author header is ignored.' })}<p class="small muted" data-count></p></div>`,
    footer: `${btn('Cancel', { extra: 'data-close' })}${btn('Add items', { variant: 'primary', extra: 'data-save' })}`,
  });
  const parse = () =>
    (bodyEl.querySelector('[name="text"]').value || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [title, ...rest] = line.split(',');
        const creator = rest.join(',').trim();
        return { title: title.trim(), category: bodyEl.querySelector('[name="category"]').value, ...(creator ? { creator } : {}) };
      })
      .filter((row, index) => {
        if (!row.title) return false;
        if (index === 0 && /^(title|name)$/i.test(row.title) && /^(author|creator|maker)?$/i.test(row.creator || '')) {
          return false;
        }
        return true;
      });
  const updateCount = () => {
    const n = parse().length;
    bodyEl.querySelector('[data-count]').textContent = n ? `${n} SKU${n === 1 ? '' : 's'} ready. Each gets a generated SKU and one identified unit.` : '';
  };
  bodyEl.addEventListener('input', updateCount);
  overlay.addEventListener('click', async (event) => {
    if (!event.target.closest('[data-save]')) return;
    const rows = parse();
    if (!rows.length) return;
    try {
      const result = await api.createAssets(rows);
      if (result.failed > 0) toast(`Added ${result.created}, skipped ${result.failed} that could not be created.`, 'error');
      else toast(`Added ${result.created} items.`, 'success');
      close();
      onDone();
    } catch (error) {
      toastFail(error);
    }
  });
}

async function renderAssetDetail(view, assetId) {
  view.innerHTML = skeleton();
  let data;
  try {
    data = await api.getAsset(assetId);
  } catch (error) {
    view.innerHTML = `<div class="stack">${notice(error.message, 'danger')}${btn('Back to catalogue', { iconName: 'back', href: '#/assets' })}</div>`;
    return;
  }
  const { asset, activeCheckout, openCheckouts = activeCheckout ? [activeCheckout] : [] } = data;
  const stock = stockBadge(asset);
  const levels = stockOf(asset);
  const units = asset.units ?? [];
  const sample = units.find((unit) => unit.status !== 'retired') ?? units[0];
  const qr = await qrImg(sample?.serial || asset.code || asset.assetId, 200, `QR label for ${sample?.serial || asset.title}`);
  const loansByUnit = Object.fromEntries(openCheckouts.filter((loan) => loan.unitId).map((loan) => [loan.unitId, loan]));
  const unitsTable = units.length
    ? `<div class="table-wrap"><table><thead><tr><th>Unit ID</th><th>Status</th><th class="hide-sm">Loan</th><th class="right"> </th></tr></thead><tbody>${units
        .map((unit) => {
          const st = unitBadge(unit);
          const loan = loansByUnit[unit.unitId];
          const canRemove = unit.status !== 'checked_out';
          return `<tr>
            <td><span class="mono strong">${esc(unit.serial)}</span></td>
            <td>${badge(st.text, st.tone, true)}</td>
            <td class="hide-sm small">${loan ? `<a href="#/members/${esc(loan.memberId)}">${esc(loan.memberName)}</a>` : unit.borrowerName ? esc(unit.borrowerName) : '—'}</td>
            <td class="right">${canRemove ? btn('Remove', { variant: 'ghost', size: 'sm', extra: `data-act="remove-unit" data-id="${esc(unit.unitId)}" data-serial="${esc(unit.serial)}"` }) : ''}</td>
          </tr>`;
        })
        .join('')}</tbody></table></div>`
    : `<p class="small muted">No identified units yet. Add copies so each one can be tracked.</p>`;
  view.innerHTML = `
    <div class="stack">
      <div class="page-head">
        <div class="col"><a href="#/assets" class="small row" style="gap:6px;margin-bottom:6px">${icon('back', 14)} Catalogue</a>
          <h1>${esc(asset.title)}</h1>
          <p class="subtitle">${[asset.creator, titleCase(asset.category), asset.location && `Shelf ${asset.location}`].filter(Boolean).map(esc).join(' · ')}</p>
        </div>
        <div class="btn-group">${btn('Edit', { extra: 'data-act="edit"' })}${isAdmin() ? btn('<span class="hide-sm">Delete</span>', { variant: 'ghost', iconName: 'trash', extra: 'data-act="delete"' }) : ''}</div>
      </div>
      <div class="grid grid-2">
        <div class="stack">
          ${card(`<div class="row-between">${badge(stock.text, stock.tone, true)}<span class="small muted">Borrowed ${asset.timesBorrowed} time${asset.timesBorrowed === 1 ? '' : 's'}</span></div>
            ${
              openCheckouts.length
                ? openCheckouts.map((loan) => `<div class="picked" style="margin-top:14px">${avatar(loan.memberName)}<div class="col grow"><a class="small strong" href="#/members/${esc(loan.memberId)}">${esc(loan.memberName)}</a><span class="tiny muted">${esc(loan.unitSerial || loan.assetCode)} · since ${esc(formatDate(loan.checkedOutAt, tz()))}</span></div>${badge(dueLabel(loan.dueAt, tz()).text, dueLabel(loan.dueAt, tz()).tone, true)}${btn('Check in', { variant: 'primary', size: 'sm', extra: `data-act="checkin" data-id="${esc(loan.checkoutId)}"` })}</div>`).join('')
                : ''
            }
            ${
              levels.available > 0 && asset.status === 'available'
                ? btn('Lend a unit', { variant: 'primary', iconName: 'scan', block: true, extra: 'style="margin-top:14px" data-act="lend"' })
                : ''
            }`, { title: 'Stock' })}
          ${card(
            `${unitsTable}`,
            {
              title: 'Units on the floor',
              actions: btn('Add units', { size: 'sm', iconName: 'plus', extra: 'data-act="add-units"' }),
            },
          )}
          ${card(
            `<div class="stack" style="gap:10px">
              ${[['SKU', `<span class="mono">${esc(asset.sku || asset.code)}</span>`], ['Units owned', String(levels.stock)], ['On the shelf', String(levels.available)], ['On loan', String(levels.onLoan)], ['Category', titleCase(asset.category)], ['Author / maker', asset.creator ?? '—'], ['ISBN / product serial', asset.identifier ?? '—'], ['Shelf', asset.location ?? '—'], ['Condition', titleCase(asset.condition ?? 'good')], ['Replacement cost', currency(asset.replacementCost)], ['Added', formatDate(asset.createdAt, tz())]]
                .map(([label, value]) => `<div class="row-between small"><span class="muted">${esc(label)}</span><span class="strong">${typeof value === 'string' && value.startsWith('<') ? value : esc(value)}</span></div>`)
                .join('')}
            </div>`,
            { title: 'Details' },
          )}
        </div>
        ${card(`<div class="col center" style="align-items:center;gap:12px">${qr}<div class="center"><div class="strong small">${esc(asset.title)}</div><div class="mono muted">${esc(sample?.serial || asset.sku || asset.code)}</div></div><p class="tiny muted center" style="max-width:260px">Each copy has its own label. Print a sheet so every unit on the floor can be scanned in and out.</p></div>`, { title: 'Unit label', actions: btn('Print sheet', { size: 'sm', iconName: 'print', href: '#/assets/labels' }) })}
      </div>
    </div>`;
  on(view,'click', async (event) => {
    if (event.target.closest('[data-act="lend"]')) go('/scan');
    if (event.target.closest('[data-act="add-units"]')) {
      const { overlay, close, bodyEl } = openModal({
        title: 'Add units',
        body: `<form id="add-units-form" class="stack">${field('How many copies', `<input name="count" type="number" min="1" max="50" value="1" required>`, { hint: 'Each new copy gets the next serial (SKU-001, SKU-002, …)' })}</form>`,
        footer: `${btn('Cancel', { extra: 'data-close' })}${btn('Add units', { variant: 'primary', extra: 'data-save' })}`,
      });
      overlay.addEventListener('click', async (click) => {
        if (!click.target.closest('[data-save]')) return;
        const count = Number(new FormData(bodyEl.querySelector('form')).get('count'));
        try {
          await api.addUnits(asset.assetId, { count });
          toast(`Added ${count} unit${count === 1 ? '' : 's'}.`, 'success');
          close();
          renderAssetDetail(view, assetId);
        } catch (error) {
          toastFail(error);
        }
      });
    }
    if (event.target.closest('[data-act="remove-unit"]')) {
      const el = event.target.closest('[data-act="remove-unit"]');
      const ok = await confirmDialog({
        title: 'Remove this unit?',
        message: `<strong>${esc(el.dataset.serial)}</strong> will leave the floor count. Past loans stay in history.`,
        confirmLabel: 'Remove unit',
        destructive: true,
      });
      if (!ok) return;
      try {
        await api.deleteUnit(asset.assetId, el.dataset.id);
        toast(`${el.dataset.serial} removed.`, 'success');
        renderAssetDetail(view, assetId);
      } catch (error) {
        toastFail(error);
      }
    }
    if (event.target.closest('[data-act="edit"]')) {
      openAssetForm({
        title: 'Edit item',
        submitLabel: 'Save changes',
        editing: true,
        draft: {
          title: asset.title,
          category: asset.category,
          creator: asset.creator ?? '',
          identifier: asset.identifier ?? '',
          location: asset.location ?? '',
          replacementCost: asset.replacementCost === undefined ? '' : String(asset.replacementCost),
          status: asset.status === 'checked_out' ? 'available' : asset.status,
          code: asset.code,
          stock: String(asset.stock ?? 1),
        },
        onSubmit: async (payload) => {
          await api.updateAsset(asset.assetId, payload);
          toast('Item updated.', 'success');
          renderAssetDetail(view, assetId);
        },
      });
    }
    if (event.target.closest('[data-act="checkin"]')) {
      const id = event.target.closest('[data-act="checkin"]')?.dataset.id || activeCheckout?.checkoutId;
      if (!id) return;
      try {
        await api.checkin(id);
        toast(`"${asset.title}" is back on the shelf.`, 'success');
        refreshCounts();
        renderAssetDetail(view, assetId);
      } catch (error) {
        toastFail(error);
      }
    }
    if (event.target.closest('[data-act="delete"]')) {
      const ok = await confirmDialog({
        title: 'Delete this item?',
        message: `<strong>${esc(asset.title)}</strong> will be removed from the catalogue. Past loan history stays in your records. This cannot be undone.`,
        confirmLabel: 'Delete permanently',
        destructive: true,
      });
      if (!ok) return;
      try {
        await api.deleteAsset(asset.assetId);
        toast('Item deleted.', 'success');
        go('/assets');
      } catch (error) {
        toastFail(error);
      }
    }
  });
}

async function renderMembers(view) {
  let query = '';
  async function paint() {
    view.innerHTML = pageHead('Members', 'Loading the register…', btn('Add member', { variant: 'primary', iconName: 'plus', extra: 'data-act="add"' })) + skeleton();
    let items = [];
    try {
      items = await api.listMembers(query || undefined).then((r) => r.items);
    } catch (error) {
      view.innerHTML = notice(error.message, 'danger');
      return;
    }
    view.innerHTML = `
      ${pageHead('Members', `${items.length} member${items.length === 1 ? '' : 's'} registered.`, btn('Add member', { variant: 'primary', iconName: 'plus', extra: 'data-act="add"' }))}
      <div class="stack">
        ${searchInput(query, 'Search by name, phone or email')}
        ${card(
          items.length === 0
            ? emptyState({
                title: query ? 'No members match your search' : 'No members yet',
                description: query ? 'Try part of a name or the last few digits of a phone number.' : 'Add the people who borrow from you so items can be signed out to them.',
                action: query ? '' : btn('Add the first member', { variant: 'primary', iconName: 'plus', extra: 'data-act="add"' }),
              })
            : `<div class="table-wrap"><table><thead><tr><th>Member</th><th class="hide-sm">Tier</th><th>Out now</th><th class="hide-sm right">Lifetime loans</th></tr></thead><tbody>${items
                .map((member) => {
                  const limit = member.borrowLimit ?? TIER_LIMITS[member.tier] ?? 3;
                  const atLimit = member.openLoans >= limit;
                  return `<tr class="clickable" data-href="#/members/${esc(member.memberId)}"><td><div class="row">${avatar(member.name)}<div class="col"><a class="strong" href="#/members/${esc(member.memberId)}">${esc(member.name)}</a><span class="tiny muted">${esc(formatPhone(member.phone))}</span></div></div></td><td class="hide-sm">${badge(member.status === 'suspended' ? 'Suspended' : titleCase(member.tier), member.status === 'suspended' ? 'danger' : 'neutral')}</td><td><span class="small ${atLimit ? 'strong' : ''}">${member.openLoans} / ${limit}</span>${atLimit && member.openLoans > 0 ? '<div class="tiny muted">At limit</div>' : ''}</td><td class="hide-sm right small muted">${member.totalLoans}</td></tr>`;
                })
                .join('')}</tbody></table></div>`,
          { bodyClass: '' },
        )}
      </div>`;
    view.querySelector('input[type="search"]')?.addEventListener(
      'input',
      debounce((event) => {
        query = event.target.value;
        paint();
      }, 250),
    );
    on(view,'click', (event) => {
      const row = event.target.closest('[data-href]');
      if (row && !event.target.closest('a,button')) go(row.dataset.href.slice(1));
      if (event.target.closest('[data-act="add"]')) {
        openMemberForm({
          title: 'Add a member',
          submitLabel: 'Add member',
          draft: emptyMemberDraft(),
          editing: false,
          onSubmit: async (payload) => {
            const member = await api.createMember(payload);
            toast(`${member.name} added.`, 'success');
            paint();
          },
        });
      }
    });
  }
  await paint();
}

async function renderMemberDetail(view, memberId) {
  view.innerHTML = skeleton();
  let data;
  try {
    data = await api.memberHistory(memberId);
  } catch (error) {
    view.innerHTML = `<div class="stack">${notice(error.message, 'danger')}${btn('Back to members', { iconName: 'back', href: '#/members' })}</div>`;
    return;
  }
  const { member, items } = data;
  const limit = member.borrowLimit ?? TIER_LIMITS[member.tier] ?? 3;
  const openLoans = items.filter((loan) => loan.status === 'open');
  const past = items.filter((loan) => loan.status !== 'open');
  const expired = member.membershipExpiresAt && new Date(member.membershipExpiresAt) < new Date();
  view.innerHTML = `
    <div class="stack">
      <div class="page-head">
        <div class="col"><a href="#/members" class="small row" style="gap:6px;margin-bottom:6px">${icon('back', 14)} Members</a>
          <div class="row">${avatar(member.name, true)}<div class="col"><h1>${esc(member.name)}</h1><p class="subtitle">${esc(formatPhone(member.phone))}${member.email ? ` · ${esc(member.email)}` : ''}</p></div></div>
        </div>
        <div class="btn-group">${btn('Edit', { extra: 'data-act="edit"' })}${isAdmin() ? btn('<span class="hide-sm">Delete</span>', { variant: 'ghost', iconName: 'trash', extra: 'data-act="delete"' }) : ''}</div>
      </div>
      ${member.status === 'suspended' ? notice('This membership is suspended, so new checkouts are blocked. Edit the member to lift it.', 'danger') : ''}
      ${expired ? notice(`Membership expired on ${formatDate(member.membershipExpiresAt, tz())}. Renew it before lending anything else.`, 'warning') : ''}
      <div class="grid grid-stats">
        ${statCard('Out now', `${member.openLoans} / ${limit}`, { tone: member.openLoans >= limit ? 'warning' : '', hint: `${titleCase(member.tier)} tier` })}
        ${statCard('Lifetime loans', member.totalLoans)}
        ${statCard('Member since', formatDate(member.createdAt, tz()))}
        ${statCard('Phone', formatPhone(member.phone))}
      </div>
      ${member.notes ? card(`<p class="small">${esc(member.notes)}</p>`, { title: 'Notes' }) : ''}
      ${card(openLoans.length ? loanRows(openLoans, { showMember: false }) : emptyState({ title: 'Nothing here', description: `${member.name} has nothing out at the moment.` }), { title: `Currently borrowed (${openLoans.length})`, bodyClass: '' })}
      ${card(
        past.length === 0
          ? emptyState({ title: 'Nothing here', description: 'No completed loans yet.' })
          : `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Taken</th><th>Returned</th><th>Outcome</th></tr></thead><tbody>${past
              .map(
                (loan) =>
                  `<tr><td><div class="col"><a class="strong" href="#/assets/${esc(loan.assetId)}">${esc(loan.assetTitle)}</a><span class="mono muted">${esc(loanCode(loan))}</span></div></td><td class="small muted">${esc(formatDate(loan.checkedOutAt, tz()))}</td><td class="small muted">${esc(formatDate(loan.returnedAt, tz()))}</td><td>${badge(titleCase(loan.status), loan.status === 'returned' ? 'positive' : 'danger', true)}</td></tr>`,
              )
              .join('')}</tbody></table></div>`,
        { title: 'History', bodyClass: '' },
      )}
    </div>`;
  on(view,'click', async (event) => {
    handleLoanAction(event, () => {
      refreshCounts();
      return renderMemberDetail(view, memberId);
    });
    if (event.target.closest('[data-act="edit"]')) {
      openMemberForm({
        title: 'Edit member',
        submitLabel: 'Save changes',
        editing: true,
        draft: {
          name: member.name,
          phone: member.phone,
          email: member.email ?? '',
          tier: member.tier,
          borrowLimit: member.borrowLimit === undefined ? '' : String(member.borrowLimit),
          status: member.status,
          membershipExpiresAt: member.membershipExpiresAt?.slice(0, 10) ?? '',
          notes: member.notes ?? '',
        },
        onSubmit: async (payload) => {
          await api.updateMember(member.memberId, payload);
          toast('Member updated.', 'success');
          renderMemberDetail(view, memberId);
        },
      });
    }
    if (event.target.closest('[data-act="delete"]')) {
      const ok = await confirmDialog({
        title: 'Delete this member?',
        message: `<strong>${esc(member.name)}</strong> will be removed from the register. Items they still have out must be checked in first.`,
        confirmLabel: 'Delete member',
        destructive: true,
      });
      if (!ok) return;
      try {
        await api.deleteMember(member.memberId);
        toast('Member deleted.', 'success');
        go('/members');
      } catch (error) {
        toastFail(error);
      }
    }
  });
}

async function renderLabels(view) {
  let query = '';
  let category = '';
  let perRow = '3';
  const selected = new Set();

  async function paint() {
    view.innerHTML = pageHead('Print QR labels', 'Loading…', '') + skeleton();
    let items = [];
    try {
      items = await api.listAssets({ q: query || undefined, include: 'units' }).then((r) => r.items);
    } catch (error) {
      view.innerHTML = notice(error.message, 'danger');
      return;
    }
    const categories = [...new Set(items.map((a) => a.category))].sort();
    const shown = items.filter((asset) => !category || asset.category === category);
    const chosen = shown.filter((asset) => selected.has(asset.assetId));
    const labels = chosen.flatMap((asset) => {
      const units = (asset.units || []).filter((unit) => unit.status !== 'retired');
      if (!units.length) return [{ title: asset.title, serial: asset.sku || asset.code }];
      return units.map((unit) => ({ title: asset.title, serial: unit.serial }));
    });
    const qrs = await Promise.all(labels.map((item) => qrImg(item.serial, 150, `QR label for ${item.serial}`)));
    view.innerHTML = `
      <div class="stack">
        <div class="page-head no-print">
          <div class="col"><a href="#/assets" class="small row" style="gap:6px;margin-bottom:6px">${icon('back', 14)} Catalogue</a>
            <h1>Print QR labels</h1>
            <p class="subtitle">Select catalogue items, then print one label per physical unit onto plain paper or sticker sheets.</p>
          </div>
          <div class="btn-group">
            ${btn('Select all', { extra: 'data-act="all"' })}
            ${btn('Clear', { extra: 'data-act="clear"' })}
            ${btn(`Print ${labels.length || ''}`, { variant: 'primary', iconName: 'print', extra: `data-act="print" ${labels.length ? '' : 'disabled'}` })}
          </div>
        </div>
        <div class="row wrap no-print">
          ${searchInput(query, 'Search the catalogue')}
          <div class="field">${select('category', category, [{ value: '', label: 'All categories' }, ...categories.map((value) => ({ value, label: titleCase(value) }))])}</div>
          <div class="field">${select('perRow', perRow, [
            { value: '2', label: '2 per row (large)' },
            { value: '3', label: '3 per row' },
            { value: '4', label: '4 per row (small)' },
          ])}</div>
        </div>
        ${card(
          shown.length === 0
            ? emptyState({ title: 'Nothing to label', description: 'Add items to the catalogue first, then come back to print their labels.' })
            : `<div style="padding:12px 18px;display:grid;gap:8px">${shown
                .map(
                  (asset) =>
                    `<label class="checkbox"><input type="checkbox" data-id="${esc(asset.assetId)}" ${selected.has(asset.assetId) ? 'checked' : ''}><span>${esc(asset.title)} <span class="mono muted">${esc(asset.code)}</span> <span class="tiny muted">${(asset.units || []).filter((u) => u.status !== 'retired').length || asset.stock || 1} unit${((asset.units || []).filter((u) => u.status !== 'retired').length || asset.stock || 1) === 1 ? '' : 's'}</span></span></label>`,
                )
                .join('')}</div>`,
          { title: `Choose items (${selected.size} selected)`, bodyClass: '', extraClass: 'no-print' },
        ).replace('class="card"', 'class="card no-print"')}
        ${
          labels.length
            ? `<section><h2 class="no-print" style="margin-bottom:12px">Preview</h2><div class="label-sheet" style="grid-template-columns:repeat(${esc(perRow)},1fr)">${labels
                .map(
                  (item, i) =>
                    `<div class="label-tag">${qrs[i]}<div class="col"><span class="label-title">${esc(item.title)}</span><span class="label-code">${esc(item.serial)}</span></div></div>`,
                )
                .join('')}</div></section>`
            : ''
        }
      </div>`;
    view.querySelector('input[type="search"]')?.addEventListener(
      'input',
      debounce((event) => {
        query = event.target.value;
        paint();
      }, 250),
    );
    view.querySelector('[name="category"]')?.addEventListener('change', (event) => {
      category = event.target.value;
      paint();
    });
    view.querySelector('[name="perRow"]')?.addEventListener('change', (event) => {
      perRow = event.target.value;
      paint();
    });
    on(view,'change', (event) => {
      const box = event.target.closest('input[type="checkbox"][data-id]');
      if (!box) return;
      if (box.checked) selected.add(box.dataset.id);
      else selected.delete(box.dataset.id);
      paint();
    });
    on(view,'click', (event) => {
      if (event.target.closest('[data-act="all"]')) {
        shown.forEach((asset) => selected.add(asset.assetId));
        paint();
      }
      if (event.target.closest('[data-act="clear"]')) {
        selected.clear();
        paint();
      }
      if (event.target.closest('[data-act="print"]')) window.print();
    });
  }
  await paint();
}

function activityChart(data) {
  const peak = Math.max(1, ...data.map((point) => Math.max(point.checkouts, point.returns)));
  const formatDay = (date) => {
    if (!date) return '';
    const [, month, day] = date.split('-');
    return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1] ?? ''}`;
  };
  return `<div>
    <div class="bars">${data
      .map(
        (point) =>
          `<div class="bar-col" title="${esc(point.date)}: ${point.checkouts} out, ${point.returns} back"><div class="bar" style="height:${(point.checkouts / peak) * 100}%"></div><div class="bar returns" style="height:${(point.returns / peak) * 100}%"></div></div>`,
      )
      .join('')}</div>
    <div class="row-between" style="margin-top:10px"><span class="tiny muted">${esc(formatDay(data[0]?.date))}</span><div class="legend"><span><span class="swatch" style="background:var(--brand)"></span>Checked out</span><span><span class="swatch" style="background:#a7d9d1"></span>Returned</span></div><span class="tiny muted">${esc(formatDay(data.at(-1)?.date))}</span></div>
  </div>`;
}

function rankedBars(rows) {
  const peak = Math.max(1, ...rows.map((row) => row.value));
  return rows
    .map(
      (row) =>
        `<div class="hbar-row"><div class="col"><span class="small truncate" title="${esc(row.label)}">${esc(row.label)}</span>${row.sublabel ? `<span class="tiny muted">${esc(row.sublabel)}</span>` : ''}</div><div class="hbar-track"><div class="hbar-fill" style="width:${(row.value / peak) * 100}%"></div></div><span class="small strong">${row.value}</span></div>`,
    )
    .join('');
}

async function renderReports(view) {
  view.innerHTML = card(skeleton(), {});
  let data;
  try {
    data = await api.report();
  } catch (error) {
    view.innerHTML = notice(error.message, 'danger');
    return;
  }
  view.innerHTML = `
    <div class="stack">
      ${pageHead(`Reports`, `Circulation and shrinkage for ${esc(org().name)}, in ${esc(org().timezone.replace('_', ' '))}.`, `${btn('Refresh', { iconName: 'refresh', extra: 'data-act="reload"' })}${btn('<span class="hide-sm">Print</span>', { iconName: 'print', extra: 'data-act="print"' })}`)}
      <div class="grid grid-stats">
        ${statCard('Utilisation', `${data.assets.utilisationPct}%`, { hint: `${data.assets.checkedOut} of ${data.assets.total} items out` })}
        ${statCard('Checkouts (30 days)', data.loans.checkoutsLast30Days, { hint: `${data.loans.returnedLast30Days} returned` })}
        ${statCard('Overdue', data.loans.overdue, { tone: data.loans.overdue > 0 ? 'danger' : 'positive', hint: `${data.shrinkage.longOverdue} over 30 days late` })}
        ${statCard('Value at risk', currency(data.shrinkage.valueAtRisk), { tone: data.shrinkage.valueAtRisk > 0 ? 'warning' : '', hint: `${data.shrinkage.lostAssets} item(s) written off` })}
      </div>
      ${card(activityChart(data.activityByDay), { title: 'Activity over the last 30 days' })}
      <div class="grid grid-2">
        ${card(data.mostBorrowed.length ? rankedBars(data.mostBorrowed.map((item) => ({ id: item.assetId, label: item.title, sublabel: item.code, value: item.timesBorrowed }))) : emptyState({ title: 'No loans yet', description: 'Circulation appears here once items start moving.' }), { title: 'Most borrowed' })}
        ${card(data.topBorrowers.length ? rankedBars(data.topBorrowers.map((m) => ({ id: m.memberId, label: m.name, sublabel: `${m.openLoans} out now`, value: m.totalLoans }))) : emptyState({ title: 'No borrowers yet', description: 'Member activity appears here.' }), { title: 'Most active members' })}
        ${card(
          `<div class="table-wrap"><table><thead><tr><th>Category</th><th class="right">Items</th><th class="right">Out now</th><th class="right">Utilisation</th></tr></thead><tbody>${data.categories
            .map(
              (row) =>
                `<tr><td class="strong">${esc(titleCase(row.category))}</td><td class="right">${row.total}</td><td class="right">${row.checkedOut}</td><td class="right muted">${row.total === 0 ? '—' : `${Math.round((row.checkedOut / row.total) * 100)}%`}</td></tr>`,
            )
            .join('')}</tbody></table></div>`,
          { title: 'Catalogue by category', bodyClass: '' },
        )}
        ${card(
          data.neverBorrowed.length === 0
            ? emptyState({ title: 'Everything has circulated', description: 'Every item in the catalogue has been borrowed at least once.' })
            : `<div style="padding:10px 18px">${data.neverBorrowed.map((item) => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line)"><a class="small truncate" href="#/assets/${esc(item.assetId)}">${esc(item.title)}</a><span class="mono muted">${esc(item.code)}</span></div>`).join('')}</div>`,
          { title: 'Never borrowed', actions: `<span class="tiny muted">${data.neverBorrowed.length} shown</span>`, bodyClass: '' },
        )}
      </div>
    </div>`;
  on(view,'click', (event) => {
    if (event.target.closest('[data-act="reload"]')) renderReports(view);
    if (event.target.closest('[data-act="print"]')) window.print();
  });
}

async function renderSettings(view) {
  if (!isAdmin()) {
    view.innerHTML = `${pageHead('Settings')}${notice('Branch settings can only be changed by an administrator. Ask them to adjust loan periods for you.')}`;
    return;
  }
  const branch = org();
  const zones = [...new Set([branch.timezone, ...TIMEZONES])];
  view.innerHTML = `
    <div class="stack">
      ${pageHead('Settings', 'Loan rules for this branch.', btn('Save changes', { variant: 'primary', extra: 'data-act="save"' }))}
      ${card(
        `<form id="settings-form" class="form-grid">
          ${field('Branch name', `<input name="name" value="${esc(branch.name)}">`)}
          ${field('Branch ID', `<input value="${esc(branch.slug || branch.orgId)}" readonly>`, { hint: 'Staff use this ID at sign-in. It cannot be changed.' })}
          ${field('Timezone', select('timezone', branch.timezone, zones.map((zone) => ({ value: zone, label: zone.replace('_', ' ') }))), { hint: 'Due dates land at the end of the day here' })}
          ${field('Default country code', `<input name="defaultCountryCode" value="${esc(branch.defaultCountryCode)}" placeholder="+91">`, { hint: 'Applied to phone numbers typed without one' })}
        </form>`,
        { title: 'Branch' },
      )}
      ${card(
        `<div class="form-grid">
          ${field('Loan period (days)', `<input form="settings-form" name="defaultLoanDays" type="number" min="1" value="${esc(branch.defaultLoanDays)}">`)}
          ${field('Renewals allowed', `<input form="settings-form" name="maxRenewals" type="number" min="0" value="${esc(branch.maxRenewals)}">`)}
          ${field('Days added per renewal', `<input form="settings-form" name="renewalDays" type="number" min="1" value="${esc(branch.renewalDays)}">`)}
        </div>`,
        { title: 'Lending rules' },
      )}
      ${card(
        `<div class="form-grid">
          ${field('New staff PIN', `<input form="settings-form" name="pin" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Leave blank to keep the current PIN">`)}
          ${field('Confirm new PIN', `<input form="settings-form" name="pinConfirm" type="password" inputmode="numeric" autocomplete="new-password">`)}
        </div>`,
        { title: 'Desk PIN' },
      )}
      ${card(
        `<p class="small muted" style="margin-bottom:12px">Each member carries a counter of how many items they currently hold, which is what enforces borrowing limits. If records were edited outside the app, recount it from the loans themselves.</p>${btn('Recount open loans', { extra: 'data-act="reconcile"' })}`,
        { title: 'Maintenance' },
      )}
    </div>`;
  on(view,'click', async (event) => {
    if (event.target.closest('[data-act="save"]')) {
      const form = view.querySelector('#settings-form');
      const data = Object.fromEntries(new FormData(form).entries());
      if ((data.pin || '') !== (data.pinConfirm || '')) {
        toast('The new PIN and confirmation do not match.', 'error');
        return;
      }
      try {
        const payload = {
          name: data.name.trim(),
          timezone: data.timezone,
          defaultCountryCode: data.defaultCountryCode.trim(),
          defaultLoanDays: Number(data.defaultLoanDays),
          maxRenewals: Number(data.maxRenewals),
          renewalDays: Number(data.renewalDays),
        };
        if (data.pin?.trim()) payload.pin = data.pin.trim();
        await api.updateSettings(payload);
        toast('Branch settings saved.', 'success');
        session.me = await api.me();
        await boot();
      } catch (error) {
        toastFail(error);
      }
    }
    if (event.target.closest('[data-act="reconcile"]')) {
      try {
        const result = await api.reconcile();
        toast(
          result.repaired === 0
            ? `All ${result.checked} member records already agree.`
            : `Repaired ${result.repaired} of ${result.checked} member records.`,
          'success',
        );
      } catch (error) {
        toastFail(error);
      }
    }
  });
}

async function route() {
  if (!readToken()) {
    await renderSignIn(document.getElementById('app'));
    return;
  }
  if (!session.me) return;
  const app = document.getElementById('app');
  if (!app.querySelector('#view')) {
    app.innerHTML = shellHtml();
    bindShell(app);
  } else {
    app.innerHTML = shellHtml();
    bindShell(app);
  }
  const view = document.getElementById('view');
  closeModals();
  const asset = match('/assets/:assetId');
  const member = match('/members/:memberId');
  if (path() === '/' || path() === '') await renderDashboard(view);
  else if (path() === '/scan') await renderScan(view);
  else if (path() === '/loans') await renderLoans(view);
  else if (path() === '/assets') await renderAssets(view);
  else if (path() === '/assets/labels') await renderLabels(view);
  else if (asset && asset.assetId !== 'labels') await renderAssetDetail(view, asset.assetId);
  else if (path() === '/members') await renderMembers(view);
  else if (member) await renderMemberDetail(view, member.memberId);
  else if (path() === '/reports') await renderReports(view);
  else if (path() === '/settings') await renderSettings(view);
  else go('/');
}

async function boot() {
  const app = document.getElementById('app');
  if (!readToken()) {
    await renderSignIn(app);
    return;
  }
  app.innerHTML = `<div class="login-screen"><div class="col center" style="align-items:center;gap:12px"><span class="brand-mark" style="width:44px;height:44px;border-radius:13px">${icon('loans', 20)}</span><span class="muted small">Loading your branch…</span></div></div>`;
  try {
    session.me = await api.me();
    writeOrg(session.me.org?.slug || session.me.org?.orgId);
    await refreshCounts();
    await route();
  } catch (error) {
    app.innerHTML = `<div class="login-screen"><div class="card login-card"><span class="brand-mark">${icon('alert', 20)}</span><h1 style="margin-bottom:8px">Cannot load data</h1><p class="muted small" style="margin-bottom:18px">${esc(error.message)}</p><div class="btn-group" style="justify-content:center">${btn('Try again', { variant: 'primary', iconName: 'refresh', extra: 'data-act="retry"' })}${btn('Sign out', { extra: 'data-act="logout"' })}</div></div></div>`;
    on(app,'click', (event) => {
      if (event.target.closest('[data-act="retry"]')) boot();
      if (event.target.closest('[data-act="logout"]')) logout();
    });
  }
}

window.addEventListener('hashchange', () => {
  if (session.me) route();
});

loadConfig().then(boot);
