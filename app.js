const CACHE_KEY = 'wah_public_snapshot_v2';
const REMIND_KEY = 'wah_silent_reminders_v1';
const THEME_KEY = 'wah_theme';
const IS_STATIC_HOST =
  window.location.protocol === 'file:' ||
  /\.(github\.io|pages\.dev|vercel\.app|netlify\.app|gitee\.io)$/i.test(window.location.hostname);

const state = {
  tagId: '',
  source: '',
  q: '',
  hideEnded: false,
  meta: null,
  allItems: [],
  isOfflineCache: false,
  isStaticMirror: IS_STATIC_HOST,
  lastSyncedAt: null,
  reminders: {}, // { [activityId]: { atMs, title, url, fired } }
  editingRemindItem: null,
};

/* ==================== 工具函数 ==================== */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim().replace(/&amp;/gi, '&').replace(/#(?:rd|wechat_redirect)$/i, '');
  if (!/^https?:\/\//i.test(trimmed)) return '';
  return trimmed.replace(
    /^(https?:\/\/mp\.weixin\.qq\.com\/s\/)([^/?#]+)/i,
    (_, prefix, slug) => `${prefix.replace(/^http:/i, 'https:')}${slug.replace(/~|%7e/gi, '_')}`
  );
}

function safeColor(hex, fallback = '#4f46e5') {
  return /^#[0-9a-fA-F]{6}$/.test(String(hex || '')) ? hex : fallback;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatMdHm(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatFullTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

function toDatetimeLocalValue(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

function formatElapsed(iso) {
  if (!iso) return '未知';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '未知';
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return '刚刚';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  return `${Math.floor(hrs / 24)} 天前`;
}

function formatCountdown(msLeft) {
  const sec = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h >= 24) return `${Math.floor(h / 24)}天${h % 24}时后`;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function avatarStyle(name) {
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const hue = hash % 360;
  return `background:linear-gradient(135deg, hsl(${hue} 70% 56%), hsl(${(hue + 30) % 360} 72% 46%))`;
}

function avatarChar(name) {
  const cleaned = String(name || '').replace(/^北京化工大学/, '').replace(/^北化/, '').trim();
  const ch = Array.from(cleaned || String(name || '活'))[0] || '活';
  return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
}

const ICONS = {
  sun: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  moon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
};

/* ==================== 报名状态计算 ==================== */
function getRegistrationStatus(item) {
  const now = Date.now();
  const startMs = item.reg_start_at ? new Date(item.reg_start_at).getTime() : NaN;
  const endMs = item.reg_end_at ? new Date(item.reg_end_at).getTime() : NaN;

  if (Number.isFinite(startMs) && startMs > now) {
    return {
      kind: 'upcoming',
      label: `距开抢 ${formatCountdown(startMs - now)}`,
      ended: false,
      targetMs: startMs,
    };
  }
  if (Number.isFinite(endMs) && endMs < now) {
    return { kind: 'ended', label: '报名已截止', ended: true, targetMs: null };
  }
  if (Number.isFinite(endMs)) {
    const left = endMs - now;
    if (left < 6 * 3600 * 1000) {
      return { kind: 'urgent', label: `即将截止 ${formatCountdown(left)}`, ended: false, targetMs: endMs };
    }
    return { kind: 'open', label: '正在报名', ended: false, targetMs: endMs };
  }
  if (Number.isFinite(startMs) && startMs <= now) {
    return { kind: 'open', label: '已开始报名', ended: false, targetMs: null };
  }
  return { kind: 'unknown', label: '详见推文', ended: false, targetMs: null };
}

/* ==================== 本地缓存 & 静音提醒存储 ==================== */
function saveSnapshotToCache(meta, allItems) {
  const cachedAt = new Date().toISOString();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ meta, allItems, cachedAt }));
  } catch {}
  return cachedAt;
}

function loadSnapshotFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.meta || !Array.isArray(parsed.allItems)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadReminders() {
  try {
    const raw = localStorage.getItem(REMIND_KEY);
    state.reminders = raw ? JSON.parse(raw) : {};
  } catch {
    state.reminders = {};
  }
}

function saveReminders() {
  try {
    localStorage.setItem(REMIND_KEY, JSON.stringify(state.reminders));
  } catch {}
}

function fireSilentReminder(rem) {
  // 1. 手机轻微两下短振动（不响铃，上课不尴尬）
  try {
    if (navigator.vibrate) navigator.vibrate([120, 70, 120]);
  } catch {}

  // 2. 系统静默通知（explicitly silent: true）
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(`报名提醒：${rem.title}`, {
        body: '活动即将开始/截止报名（静音提醒），点击前往原推文',
        silent: true,
        vibrate: [120, 70, 120],
      });
      n.onclick = () => {
        const target = safeHref(rem.url);
        if (target) window.open(target, '_blank', 'noopener,noreferrer');
      };
    }
  } catch {}

  // 3. 页内极简静默横幅
  const toast = document.getElementById('reminderToast');
  const link = safeHref(rem.url);
  toast.innerHTML = `
    <div><strong>🔔 静音报名提醒：</strong>${escapeHtml(rem.title)}</div>
    <div style="display:flex;gap:8px;flex-shrink:0;">
      ${link ? `<a class="btn btn-sm btn-primary" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">去原推文 ↗</a>` : ''}
      <button type="button" class="btn btn-sm" id="dismissToastBtn">知道了</button>
    </div>
  `;
  toast.classList.remove('hidden');
  document.getElementById('dismissToastBtn').addEventListener('click', () => {
    toast.classList.add('hidden');
  });
}

function checkDueReminders() {
  const now = Date.now();
  let changed = false;
  for (const [actId, rem] of Object.entries(state.reminders)) {
    if (!rem || rem.fired) continue;
    if (now >= rem.atMs) {
      rem.fired = true;
      changed = true;
      fireSilentReminder(rem);
    }
  }
  if (changed) {
    saveReminders();
    renderFilteredLocal();
  }
}

function downloadSilentIcs(item, triggerMs) {
  const pad = (n) => String(n).padStart(2, '0');
  const toUtcIcs = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
      d.getUTCHours()
    )}${pad(d.getUTCMinutes())}00Z`;
  };
  const startMs = triggerMs || Date.now() + 10 * 60 * 1000;
  const endMs = startMs + 15 * 60 * 1000;
  const desc = `来源：${item.source_account_name}\\n原推文：${safeHref(item.source_article_url) || item.source_article_url || ''}`;
  // ACTION:DISPLAY triggers visual banner/vibration following silent mode (NO ACTION:AUDIO ringtone)
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BUCT Activity Hub//CN',
    'BEGIN:VEVENT',
    `UID:buct-act-${item.id}-${startMs}@hub`,
    `DTSTAMP:${toUtcIcs(Date.now())}`,
    `DTSTART:${toUtcIcs(startMs)}`,
    `DTEND:${toUtcIcs(endMs)}`,
    `SUMMARY:【报名提醒】${item.title.replace(/\r?\n/g, ' ')}`,
    `DESCRIPTION:${desc}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:活动即将开始报名',
    'TRIGGER:-PT5M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `报名提醒-${item.id}.ics`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

/* ==================== 主题切换 ==================== */
function applyThemeIcon() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const btn = document.getElementById('themeToggle');
  btn.innerHTML = dark ? ICONS.sun : ICONS.moon;
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {}
  applyThemeIcon();
});
applyThemeIcon();

/* ==================== 渲染 ==================== */
function updateFreshnessUI() {
  const pill = document.getElementById('livePill');
  const liveText = document.getElementById('liveStatusText');
  const banner = document.getElementById('cacheBanner');
  const bannerText = document.getElementById('cacheBannerText');
  const footerTime = document.getElementById('lastUpdateText');

  const ts = state.meta?.stats?.lastCrawledAt || state.lastSyncedAt || state.meta?.stats?.lastUpdatedAt;
  const elapsed = formatElapsed(ts);
  const absStr = formatFullTime(ts);

  if (state.isOfflineCache) {
    pill.classList.add('offline');
    liveText.textContent = `缓存 · ${elapsed}`;
    banner.classList.remove('hidden');
    bannerText.innerHTML = `<strong>离线缓存模式</strong> · 数据更新于 <strong>${escapeHtml(elapsed)}</strong>（${escapeHtml(
      absStr
    )}）· 仍可筛选并跳转原推文`;
    footerTime.textContent = `离线快照 · 更新于 ${elapsed}（${absStr}）`;
  } else {
    pill.classList.remove('offline');
    liveText.textContent = `更新于 ${elapsed}`;
    banner.classList.add('hidden');
    footerTime.textContent = state.isStaticMirror
      ? `数据更新于 ${elapsed}（${absStr}）· 永久静态镜像`
      : `更新于 ${elapsed}（${absStr}）· 已开启离线缓存`;
  }

  const adminLink = document.querySelector('.admin-quiet-link');
  if (adminLink) {
    adminLink.style.display = state.isStaticMirror ? 'none' : '';
  }
}

function renderTagBar() {
  const tagBar = document.getElementById('tagBar');
  if (!state.meta) return;
  const total = state.meta.stats?.publishedTotal ?? state.allItems.length;

  const parts = [
    `<button class="chip ${state.tagId === '' ? 'active' : ''}" data-tag-id="" type="button" style="--c:#4f46e5">
      <span>全部</span><span class="chip-count">${total}</span>
    </button>`,
  ];
  for (const tag of state.meta.tags || []) {
    const active = String(tag.id) === String(state.tagId);
    parts.push(`
      <button class="chip ${active ? 'active' : ''}" data-tag-id="${tag.id}" type="button" style="--c:${safeColor(tag.color)}">
        <span class="chip-dot"></span>
        <span>${escapeHtml(tag.name)}</span>
        <span class="chip-count">${tag.published_count || 0}</span>
      </button>
    `);
  }
  tagBar.innerHTML = parts.join('');
}

function renderSourceSelect() {
  const select = document.getElementById('sourceFilter');
  const opts = ['<option value="">全部公众号</option>'];
  for (const s of state.meta?.sources || []) {
    opts.push(
      `<option value="${escapeHtml(s.name)}" ${s.name === state.source ? 'selected' : ''}>${escapeHtml(s.name)} (${
        s.count
      })</option>`
    );
  }
  select.innerHTML = opts.join('');
}

function filterItemsLocally(items) {
  const needle = state.q.toLowerCase();
  return (items || []).filter((item) => {
    if (state.hideEnded && getRegistrationStatus(item).ended) return false;
    if (state.tagId && !(item.tags || []).some((t) => String(t.id) === String(state.tagId))) return false;
    if (state.source && item.source_account_name !== state.source) return false;
    if (needle) {
      const hay = [item.title, item.credit_hint, item.location, item.source_account_name, item.source_article_title]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

function renderCard(item) {
  const primary = (item.tags || [])[0];
  const accent = safeColor(primary?.color);
  const regSt = getRegistrationStatus(item);
  const isUncertain = Boolean(item.is_uncertain) || (item.tags || []).some((t) => /存疑/.test(t.name));
  const rem = state.reminders[item.id];
  const isArmed = Boolean(rem && !rem.fired);

  const tagsHtml = (item.tags || [])
    .map((t) => `<span class="act-tag" style="--c:${safeColor(t.color)}">${escapeHtml(t.name)}</span>`)
    .join('');

  const regDisplay =
    item.reg_time_text ||
    (item.reg_start_at && item.reg_end_at
      ? `${formatMdHm(item.reg_start_at)} ~ ${formatMdHm(item.reg_end_at)}`
      : item.reg_start_at
      ? `${formatMdHm(item.reg_start_at)} 开始`
      : item.reg_end_at
      ? `${formatMdHm(item.reg_end_at)} 截止`
      : item.deadline || '详见原推文');

  const pubDisplay = formatMdHm(item.published_at) || '—';
  const creditText =
    item.credit_hint || (isUncertain ? '二课类别存疑 · 可自行联系主办方询问' : '');

  const jumpUrl = safeHref(item.source_article_url);
  const linkHtml = jumpUrl
    ? `<a class="act-link" href="${escapeHtml(jumpUrl)}" target="_blank" rel="noopener noreferrer">原推文 ↗</a>`
    : '';

  return `
    <article class="act-card ${regSt.ended ? 'is-ended' : ''} ${isUncertain ? 'is-uncertain' : ''}" style="--accent:${accent}">
      <div class="act-body">
        <div class="act-top">
          <div class="act-tags">${tagsHtml}</div>
          <span class="reg-pill ${regSt.kind}" data-reg-pill="${item.id}">${escapeHtml(regSt.label)}</span>
        </div>

        <h2 class="act-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h2>

        ${
          creditText
            ? `<div class="act-credit ${isUncertain ? 'uncertain' : ''}">${isUncertain ? '⚠️ ' : '✦ '}${escapeHtml(
                creditText
              )}</div>`
            : ''
        }

        <div class="time-box">
          <div class="time-row">
            <span class="time-key">报名时间</span>
            <span class="time-val ${item.reg_time_text || item.reg_start_at || item.reg_end_at ? 'reg-highlight' : 'muted'}">${escapeHtml(
              regDisplay
            )}</span>
          </div>
          <div class="time-row">
            <span class="time-key">发布时间</span>
            <span class="time-val muted">${escapeHtml(pubDisplay)}</span>
          </div>
          ${
            item.event_time
              ? `<div class="time-row"><span class="time-key">活动时间</span><span class="time-val muted">${escapeHtml(
                  item.event_time
                )}</span></div>`
              : ''
          }
        </div>
      </div>

      <footer class="act-foot">
        <div class="act-source" title="${escapeHtml(item.source_account_name)} · 《${escapeHtml(
          item.source_article_title
        )}》">
          <div class="avatar" style="${avatarStyle(item.source_account_name)}">${escapeHtml(
            avatarChar(item.source_account_name)
          )}</div>
          <span class="src-name">${escapeHtml(item.source_account_name)}</span>
        </div>
        <div class="foot-actions">
          <button type="button" class="remind-btn ${isArmed ? 'armed' : ''}" data-remind-id="${item.id}" title="设置静音振动提醒（上课不响铃）">
            ${isArmed ? '✓ 已提醒' : '🔔 提醒'}
          </button>
          ${linkHtml}
        </div>
      </footer>
    </article>
  `;
}

function renderFilteredLocal() {
  const grid = document.getElementById('activitiesGrid');
  const items = filterItemsLocally(state.allItems);
  if (!items.length) {
    grid.innerHTML = '<div class="empty-box">暂无符合条件的活动</div>';
    return;
  }
  grid.innerHTML = items.map(renderCard).join('');
}

function applyMetaToDom() {
  if (!state.meta) return;
  document.title = state.meta.siteTitle || '北化二课活动';
  document.getElementById('siteTitle').textContent = state.meta.siteTitle || '北化二课活动';
  renderTagBar();
  renderSourceSelect();
  updateFreshnessUI();
}

/* ==================== 静音提醒弹窗 ==================== */
function openRemindModal(item) {
  state.editingRemindItem = item;
  document.getElementById('rmActName').textContent = item.title;

  const existing = state.reminders[item.id];
  const cancelBtn = document.getElementById('rmCancelExisting');
  cancelBtn.classList.toggle('hidden', !existing || existing.fired);

  const regSt = getRegistrationStatus(item);
  const targetMs = regSt.targetMs;
  const quickWrap = document.getElementById('rmQuickWrap');
  const customInput = document.getElementById('rmCustomTime');

  const quickButtons = [];
  if (targetMs && targetMs > Date.now() + 60 * 1000) {
    const labelBase = regSt.kind === 'upcoming' ? '开抢前' : '截止前';
    if (targetMs - 10 * 60 * 1000 > Date.now()) {
      quickButtons.push({ label: `${labelBase} 10 分钟`, ms: targetMs - 10 * 60 * 1000 });
    }
    if (targetMs - 5 * 60 * 1000 > Date.now()) {
      quickButtons.push({ label: `${labelBase} 5 分钟`, ms: targetMs - 5 * 60 * 1000 });
    }
    quickButtons.push({ label: regSt.kind === 'upcoming' ? '开抢准点' : '截止前 1 分钟', ms: targetMs - 60 * 1000 });
  } else {
    quickButtons.push({ label: '30 分钟后提醒', ms: Date.now() + 30 * 60 * 1000 });
    quickButtons.push({ label: '1 小时后提醒', ms: Date.now() + 60 * 60 * 1000 });
  }

  quickWrap.innerHTML = quickButtons
    .map(
      (b, idx) =>
        `<button type="button" class="rm-quick-btn ${idx === 0 ? 'active' : ''}" data-ms="${b.ms}">${escapeHtml(
          b.label
        )}</button>`
    )
    .join('');

  const defaultMs = existing && !existing.fired ? existing.atMs : quickButtons[0].ms;
  customInput.value = toDatetimeLocalValue(defaultMs);

  quickWrap.querySelectorAll('.rm-quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      quickWrap.querySelectorAll('.rm-quick-btn').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      customInput.value = toDatetimeLocalValue(Number(btn.dataset.ms));
    });
  });

  document.getElementById('remindModal').classList.remove('hidden');
}

function closeRemindModal() {
  document.getElementById('remindModal').classList.add('hidden');
  state.editingRemindItem = null;
}

document.getElementById('rmClose').addEventListener('click', closeRemindModal);
document.getElementById('remindModal').addEventListener('click', (e) => {
  if (e.target.id === 'remindModal') closeRemindModal();
});

document.getElementById('rmSaveBtn').addEventListener('click', async () => {
  const item = state.editingRemindItem;
  if (!item) return;
  const val = document.getElementById('rmCustomTime').value;
  const atMs = new Date(val).getTime();
  if (!Number.isFinite(atMs) || atMs <= Date.now()) {
    alert('请选择一个晚于当前时间的提醒时间');
    return;
  }

  // Request silent browser notification permission softly
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission().catch(() => {});
  }
  // Gentle 1-tap feedback vibration on supported phones
  try {
    if (navigator.vibrate) navigator.vibrate(50);
  } catch {}

  state.reminders[item.id] = {
    atMs,
    title: item.title,
    url: safeHref(item.source_article_url) || '',
    fired: false,
  };
  saveReminders();
  closeRemindModal();
  renderFilteredLocal();
});

document.getElementById('rmCancelExisting').addEventListener('click', () => {
  const item = state.editingRemindItem;
  if (!item) return;
  delete state.reminders[item.id];
  saveReminders();
  closeRemindModal();
  renderFilteredLocal();
});

document.getElementById('rmIcsBtn').addEventListener('click', () => {
  const item = state.editingRemindItem;
  if (!item) return;
  const val = document.getElementById('rmCustomTime').value;
  const atMs = new Date(val).getTime();
  downloadSilentIcs(item, Number.isFinite(atMs) ? atMs : Date.now() + 10 * 60 * 1000);
});

/* ==================== 数据同步 ==================== */
async function fetchJsonWithTimeout(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadLiveOrMirrorData() {
  if (!IS_STATIC_HOST) {
    try {
      const [meta, fullData] = await Promise.all([
        fetchJsonWithTimeout('/api/public/meta', 6000),
        fetchJsonWithTimeout('/api/public/activities?limit=200', 6000),
      ]);
      return {
        meta,
        items: fullData.items || [],
        isStaticMirror: false,
      };
    } catch (err) {
      // Fall back to static ./data.json if served from a custom static domain (no /api backend)
      if (!String(err?.message || '').includes('404')) {
        throw err;
      }
    }
  }

  const snapshot = await fetchJsonWithTimeout(`./data.json?t=${Date.now()}`, 8000);
  return {
    meta: snapshot.meta || {},
    items: snapshot.items || [],
    isStaticMirror: true,
  };
}

async function refreshAll() {
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.classList.add('spinning');
  try {
    const result = await loadLiveOrMirrorData();
    state.meta = result.meta;
    state.allItems = result.items;
    state.isOfflineCache = false;
    state.isStaticMirror = result.isStaticMirror;
    state.lastSyncedAt = saveSnapshotToCache(result.meta, state.allItems);
    applyMetaToDom();
    renderFilteredLocal();
  } catch (err) {
    const cached = loadSnapshotFromCache();
    if (cached) {
      state.meta = cached.meta;
      state.allItems = cached.allItems;
      state.isOfflineCache = true;
      state.isStaticMirror = IS_STATIC_HOST || state.isStaticMirror;
      state.lastSyncedAt = cached.cachedAt;
      applyMetaToDom();
      renderFilteredLocal();
    } else {
      document.getElementById('activitiesGrid').innerHTML = `<div class="empty-box">${
        IS_STATIC_HOST ? '页面数据正在同步中或网络异常，请稍后刷新' : '主机暂离线且暂无本地缓存'
      }（${escapeHtml(err.message)}）</div>`;
    }
  } finally {
    setTimeout(() => refreshBtn.classList.remove('spinning'), 260);
  }
}

/* ==================== 事件绑定 ==================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

document.getElementById('tagBar').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  state.tagId = btn.dataset.tagId || '';
  renderTagBar();
  renderFilteredLocal();
});

document.getElementById('sourceFilter').addEventListener('change', (e) => {
  state.source = e.target.value;
  renderFilteredLocal();
});

document.getElementById('hideEndedCheck').addEventListener('change', (e) => {
  state.hideEnded = e.target.checked;
  renderFilteredLocal();
});

let searchTimer = null;
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = e.target.value.trim();
    renderFilteredLocal();
  }, 150);
});

document.getElementById('activitiesGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-remind-id]');
  if (!btn) return;
  const id = Number(btn.dataset.remindId);
  const item = state.allItems.find((a) => a.id === id);
  if (item) openRemindModal(item);
});

document.getElementById('refreshBtn').addEventListener('click', refreshAll);
document.getElementById('retryOnlineBtn').addEventListener('click', refreshAll);

const backTop = document.getElementById('backTop');
window.addEventListener(
  'scroll',
  () => backTop.classList.toggle('show', window.scrollY > 500),
  { passive: true }
);
backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

/* ==================== 启动与定时器 ==================== */
loadReminders();
const initialCached = loadSnapshotFromCache();
if (initialCached) {
  state.meta = initialCached.meta;
  state.allItems = initialCached.allItems;
  state.lastSyncedAt = initialCached.cachedAt;
  applyMetaToDom();
  renderFilteredLocal();
}

refreshAll();

// 每秒更新倒计时胶囊 & 检查到点的静音振动提醒
setInterval(() => {
  for (const item of state.allItems) {
    const el = document.querySelector(`[data-reg-pill="${item.id}"]`);
    if (!el) continue;
    const st = getRegistrationStatus(item);
    el.className = `reg-pill ${st.kind}`;
    el.textContent = st.label;
  }
  checkDueReminders();
}, 1000);

setInterval(() => {
  if (state.meta) updateFreshnessUI();
}, 30 * 1000);
setInterval(refreshAll, 60 * 1000);
