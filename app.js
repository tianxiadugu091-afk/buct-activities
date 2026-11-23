const CACHE_KEY = 'wah_public_snapshot_v2';
const REMIND_KEY = 'wah_silent_reminders_v1';
const SAVED_KEY = 'wah_saved_v1';
const VIEW_MODE_KEY = 'wah_view_mode_v1';
const THEME_KEY = 'wah_theme';
const HUB_PUBLIC_URL = 'https://tianxiadugu091-afk.github.io/buct-activities/';
const IS_STATIC_HOST =
  window.location.protocol === 'file:' ||
  /\.(github\.io|pages\.dev|vercel\.app|netlify\.app|gitee\.io)$/i.test(window.location.hostname);

const state = {
  tagId: '',
  source: '',
  audienceFilter: '',
  sortBy: 'smart',
  q: '',
  hideEnded: false,
  onlySaved: false,
  viewMode: 'grid', // 'grid' | 'deck'
  deckIndex: 0,
  meta: null,
  allItems: [],
  renderedItems: [],
  isOfflineCache: false,
  isStaticMirror: IS_STATIC_HOST,
  lastSyncedAt: null,
  reminders: {}, // { [activityId]: { atMs, title, url, fired } }
  savedIds: new Set(),
  editingRemindItem: null,
  activeDetailId: null,
  posterItem: null,
  posterDataUrl: '',
};

/* ==================== 工具函数 ==================== */
function haptic(ms = 10) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {}
}

function loadSavedIds() {
  try {
    const arr = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
    state.savedIds = new Set(Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : []);
  } catch {
    state.savedIds = new Set();
  }
}

function persistSavedIds() {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify([...state.savedIds]));
  } catch {}
}

function loadViewMode() {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    if (v === 'grid' || v === 'deck') state.viewMode = v;
  } catch {}
}

function persistViewMode() {
  try {
    localStorage.setItem(VIEW_MODE_KEY, state.viewMode);
  } catch {}
}

function updateViewModeButtonUI() {
  const btn = document.getElementById('viewModeBtn');
  if (!btn) return;
  const isDeck = state.viewMode === 'deck';
  btn.classList.toggle('view-deck-active', isDeck);
  btn.title = isDeck ? '切回双列卡片墙' : '切换沉浸横滑翻卡';
  btn.setAttribute('aria-label', btn.title);
  btn.innerHTML = isDeck
    ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>'
    : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="16" rx="2.5"/><path d="M2 7v10"/><path d="M22 7v10"/></svg>';
}
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

/* ==================== 报名状态与活动过期计算 ==================== */
function getRegistrationStatus(item) {
  const now = Date.now();
  const startMs = item.reg_start_at ? new Date(item.reg_start_at).getTime() : NaN;
  const endMs = item.reg_end_at ? new Date(item.reg_end_at).getTime() : NaN;
  const eventEndMs = item.event_end_at ? new Date(item.event_end_at).getTime() : NaN;

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
  if (Number.isFinite(eventEndMs) && eventEndMs < now) {
    return { kind: 'ended', label: '活动已结束', ended: true, targetMs: null };
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

/* ==================== 面向人群快捷筛选 ==================== */
function getAudienceObj(item) {
  const raw = item?.audience_json;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch {}
  }
  return { scope: 'unknown', colleges: [], grades: [], degrees: [], campuses: [], politics: [], clubOnly: false };
}

function matchesAudienceQuickFilter(item, filterKey) {
  if (!filterKey) return true;
  const aud = getAudienceObj(item);
  if (filterKey === 'all') return aud.scope === 'all';
  if (filterKey === 'club') return Boolean(aud.clubOnly);
  if (filterKey === 'college') return Array.isArray(aud.colleges) && aud.colleges.length > 0;
  if (filterKey === 'freshman') return Array.isArray(aud.grades) && aud.grades.includes('freshman');
  if (filterKey === 'undergrad') {
    return (
      aud.scope === 'all' ||
      (Array.isArray(aud.degrees) && aud.degrees.includes('undergrad'))
    );
  }
  if (filterKey === 'grad') {
    return (
      aud.scope === 'all' ||
      (Array.isArray(aud.degrees) && aud.degrees.includes('grad'))
    );
  }
  return true;
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
  const opts = ['<option value="">全部公众号</option>'];
  for (const s of state.meta?.sources || []) {
    opts.push(
      `<option value="${escapeHtml(s.name)}" ${s.name === state.source ? 'selected' : ''}>${escapeHtml(s.name)} (${
        s.count
      })</option>`
    );
  }
  const html = opts.join('');
  const desktopSelect = document.getElementById('sourceFilter');
  const mobileSelect = document.getElementById('fsSourceSelect');
  if (desktopSelect) {
    desktopSelect.innerHTML = html;
    desktopSelect.value = state.source;
  }
  if (mobileSelect) {
    mobileSelect.innerHTML = html;
    mobileSelect.value = state.source;
  }
}

function filterItemsLocally(items) {
  const needle = state.q.toLowerCase();

  return (items || []).filter((item) => {
    const regSt = getRegistrationStatus(item);
    if (state.onlySaved && !state.savedIds.has(item.id)) return false;
    if (state.hideEnded && regSt.ended) return false;
    if (state.audienceFilter && !matchesAudienceQuickFilter(item, state.audienceFilter)) return false;
    if (state.tagId && !(item.tags || []).some((t) => String(t.id) === String(state.tagId))) return false;
    if (state.source && item.source_account_name !== state.source) return false;
    if (needle) {
      const hay = [
        item.title,
        item.credit_hint,
        item.audience_text,
        item.location,
        item.source_account_name,
        item.source_article_title,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

function sortItemsLocally(items) {
  const arr = [...items];
  const pubMs = (it) => {
    const t = it.published_at ? new Date(it.published_at).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  };

  if (state.sortBy === 'latest') {
    arr.sort((a, b) => pubMs(b) - pubMs(a));
    return arr;
  }

  if (state.sortBy === 'deadline') {
    arr.sort((a, b) => {
      const sa = getRegistrationStatus(a);
      const sb = getRegistrationStatus(b);
      if (sa.ended !== sb.ended) return sa.ended ? 1 : -1;
      const ta = sa.targetMs || Number.MAX_SAFE_INTEGER;
      const tb = sb.targetMs || Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      return pubMs(b) - pubMs(a);
    });
    return arr;
  }

  // Default smart urgency-first sorting: urgent -> upcoming -> open -> unknown -> ended (sunk to bottom)
  const rankMap = { urgent: 0, upcoming: 1, open: 2, unknown: 3, ended: 4 };
  arr.sort((a, b) => {
    const sa = getRegistrationStatus(a);
    const sb = getRegistrationStatus(b);
    const ra = rankMap[sa.kind] ?? 3;
    const rb = rankMap[sb.kind] ?? 3;
    if (ra !== rb) return ra - rb;
    if ((ra === 0 || ra === 1) && sa.targetMs && sb.targetMs && sa.targetMs !== sb.targetMs) {
      return sa.targetMs - sb.targetMs;
    }
    return pubMs(b) - pubMs(a);
  });
  return arr;
}

function isHotItem(regSt) {
  if (!regSt || regSt.ended) return false;
  if (regSt.kind === 'urgent') return true;
  if (regSt.kind === 'upcoming' && regSt.targetMs && regSt.targetMs - Date.now() <= 24 * 3600 * 1000) {
    return true;
  }
  return false;
}

function getItemDisplayInfo(item) {
  const primary = (item.tags || [])[0];
  const accent = safeColor(primary?.color);
  const regSt = getRegistrationStatus(item);
  const isHot = isHotItem(regSt);
  const isUncertain = Boolean(item.is_uncertain) || (item.tags || []).some((t) => /存疑/.test(t.name));
  const rem = state.reminders[item.id];
  const isArmed = Boolean(rem && !rem.fired);
  const isSaved = state.savedIds.has(item.id);
  const aud = getAudienceObj(item);
  const audText = item.audience_text || (aud.scope === 'all' ? '全校可报' : '人群详见推文');

  let audClass = 'unknown';
  if (aud.clubOnly) audClass = 'club';
  else if (aud.scope === 'all') audClass = 'all';
  else if (aud.scope === 'restricted') audClass = 'restricted';

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

  return {
    primary,
    accent,
    regSt,
    isHot,
    isUncertain,
    isArmed,
    isSaved,
    audText,
    audClass,
    tagsHtml,
    regDisplay,
    pubDisplay,
    creditText,
    jumpUrl,
  };
}

function renderCard(item, idx = 0, animate = false) {
  const info = getItemDisplayInfo(item);
  const { accent, regSt, isHot, isUncertain, isArmed, isSaved, audText, audClass, tagsHtml, regDisplay, pubDisplay, creditText, jumpUrl } = info;
  const linkHtml = jumpUrl
    ? `<a class="act-link" href="${escapeHtml(jumpUrl)}" target="_blank" rel="noopener noreferrer">原推文 ↗</a>`
    : '';
  const enterClass = animate ? 'card-enter' : '';
  const staggerStyle = animate ? `--i:${Math.min(idx, 10)};` : '';

  return `
    <article class="act-card ${regSt.ended ? 'is-ended' : ''} ${isUncertain ? 'is-uncertain' : ''} ${isHot ? 'is-hot' : ''} ${enterClass}" data-card-id="${item.id}" style="${staggerStyle}--accent:${accent}">
      <div class="act-body">
        <div class="act-top">
          <div class="act-tags">${tagsHtml}</div>
          <span class="reg-pill ${regSt.kind}" data-reg-pill="${item.id}">${escapeHtml(regSt.label)}</span>
        </div>

        <h2 class="act-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h2>

        <div class="audience-row">
          <span class="audience-badge ${audClass}">👥 ${escapeHtml(audText)}</span>
        </div>

        ${
          creditText
            ? `<div class="act-credit ${isUncertain ? 'uncertain' : ''}">${isUncertain ? '⚠️ ' : '✦ '}${escapeHtml(
                creditText
              )}</div>`
            : ''
        }

        <div class="time-box">
          <div class="time-row">
            <span class="time-key">报名</span>
            <span class="time-val ${item.reg_time_text || item.reg_start_at || item.reg_end_at ? 'reg-highlight' : 'muted'}">${escapeHtml(
              regDisplay
            )}</span>
          </div>
          <div class="time-row time-row-secondary">
            <span class="time-key">发布时间</span>
            <span class="time-val muted">${escapeHtml(pubDisplay)}</span>
          </div>
          ${
            item.event_time
              ? `<div class="time-row time-row-secondary"><span class="time-key">活动时间</span><span class="time-val muted">${escapeHtml(
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
        <div class="card-mobile-actions">
          <button type="button" class="card-mobile-star ${isSaved ? 'saved' : ''}" data-star-id="${item.id}" aria-label="${
            isSaved ? '取消收藏' : '收藏到待抢清单'
          }">${isSaved ? '★' : '☆'}</button>
          <span class="card-mobile-cue ${isArmed ? 'armed' : ''}">${isArmed ? '🔔' : '详情 ›'}</span>
        </div>
        <div class="foot-actions">
          <button type="button" class="star-btn ${isSaved ? 'saved' : ''}" data-star-id="${item.id}" title="${
            isSaved ? '移出待抢清单' : '加入待抢清单'
          }">${isSaved ? '★' : '☆'}</button>
          <button type="button" class="remind-btn ${isArmed ? 'armed' : ''}" data-remind-id="${item.id}" title="设置静音振动提醒（上课不响铃）">
            ${isArmed ? '✓ 已提醒' : '🔔 提醒'}
          </button>
          ${linkHtml}
        </div>
      </footer>
    </article>
  `;
}

function renderDeckCard(item, idx, activeIdx) {
  const info = getItemDisplayInfo(item);
  const { accent, regSt, isHot, isUncertain, isArmed, isSaved, audText, audClass, tagsHtml, regDisplay, pubDisplay, creditText, jumpUrl } = info;
  return `
    <article class="deck-card ${isHot ? 'is-hot' : ''} ${idx === activeIdx ? 'is-active' : ''}" data-deck-index="${idx}" data-card-id="${item.id}" style="--accent:${accent}">
      <div class="deck-hero">
        <div class="deck-hero-top">
          <div class="act-tags">${tagsHtml}</div>
          <span class="reg-pill ${regSt.kind}" data-reg-pill="${item.id}">${escapeHtml(regSt.label)}</span>
        </div>
        <h2 class="deck-title">${escapeHtml(item.title)}</h2>
      </div>
      <div class="deck-body">
        <div class="audience-row">
          <span class="audience-badge ${audClass}">👥 面向人群：${escapeHtml(audText)}</span>
        </div>
        ${
          creditText
            ? `<div class="ds-credit-card ${isUncertain ? 'uncertain' : ''}">${
                isUncertain ? '⚠️ ' : '✦ '
              }${escapeHtml(creditText)}</div>`
            : ''
        }
        <div class="ds-time-card">
          <div class="time-row">
            <span class="time-key">报名时间</span>
            <span class="time-val ${item.reg_time_text || item.reg_start_at || item.reg_end_at ? 'reg-highlight' : 'muted'}">${escapeHtml(
              regDisplay
            )}</span>
          </div>
          ${
            item.event_time
              ? `<div class="time-row"><span class="time-key">活动时间</span><span class="time-val">${escapeHtml(
                  item.event_time
                )}</span></div>`
              : ''
          }
          <div class="time-row">
            <span class="time-key">发布时间</span>
            <span class="time-val muted">${escapeHtml(pubDisplay)}</span>
          </div>
        </div>
        <div class="act-source" style="margin-top:auto">
          <div class="avatar" style="${avatarStyle(item.source_account_name)}">${escapeHtml(
            avatarChar(item.source_account_name)
          )}</div>
          <span class="src-name">${escapeHtml(item.source_account_name)}</span>
        </div>
      </div>
      <div class="deck-foot">
        <button type="button" class="deck-act-btn ${isSaved ? 'saved' : ''}" data-star-id="${item.id}" title="收藏待抢">${
          isSaved ? '★' : '☆'
        }</button>
        <button type="button" class="deck-act-btn ${isArmed ? 'armed' : ''}" data-remind-id="${item.id}" title="静音提醒">${
          isArmed ? '✓' : '🔔'
        }</button>
        <button type="button" class="deck-act-btn" data-poster-id="${item.id}" title="生成分享海报图">🖼</button>
        ${
          jumpUrl
            ? `<a class="deck-act-btn primary" href="${escapeHtml(jumpUrl)}" target="_blank" rel="noopener noreferrer">原推文 ↗</a>`
            : `<button type="button" class="deck-act-btn primary" data-open-detail-id="${item.id}">看详情</button>`
        }
      </div>
    </article>
  `;
}

function renderRadarBar() {
  const wrap = document.getElementById('radarWrap');
  const track = document.getElementById('radarTrack');
  if (!wrap || !track) return;
  const now = Date.now();
  const candidates = [];
  for (const item of state.allItems) {
    const st = getRegistrationStatus(item);
    if (st.ended) continue;
    const withinUpcoming = st.kind === 'upcoming' && st.targetMs && st.targetMs - now <= 48 * 3600 * 1000;
    const withinOpen = st.kind === 'open' && st.targetMs && st.targetMs - now <= 72 * 3600 * 1000;
    if (st.kind === 'urgent' || withinUpcoming || withinOpen) {
      candidates.push({ item, st });
    }
  }
  candidates.sort((a, b) => (a.st.targetMs || Number.MAX_SAFE_INTEGER) - (b.st.targetMs || Number.MAX_SAFE_INTEGER));
  const top = candidates.slice(0, 6);
  if (!top.length) {
    wrap.classList.add('hidden');
    track.innerHTML = '';
    return;
  }
  wrap.classList.remove('hidden');
  track.innerHTML = top
    .map(
      ({ item, st }) => `
      <button type="button" class="radar-pill" data-radar-id="${item.id}">
        <span class="radar-pill-time ${st.kind}" data-radar-time="${item.id}">${escapeHtml(st.label)}</span>
        <span class="radar-pill-title">${escapeHtml(item.title)}</span>
      </button>
    `
    )
    .join('');
}

function updateFavDockUI() {
  const dock = document.getElementById('favDock');
  const toggleBtn = document.getElementById('favDockToggle');
  const countEl = document.getElementById('favDockCount');
  const textEl = document.getElementById('favDockText');
  const allBtn = document.getElementById('favDockAllBtn');
  if (!dock) return;

  const validCount = state.allItems.filter((it) => state.savedIds.has(it.id)).length;
  if (validCount === 0 && !state.onlySaved) {
    dock.classList.add('hidden');
    return;
  }
  dock.classList.remove('hidden');
  countEl.textContent = String(validCount);
  toggleBtn.classList.toggle('active', state.onlySaved);
  textEl.textContent = state.onlySaved ? '仅看已收藏' : '待抢清单';
  allBtn.classList.toggle('hidden', !state.onlySaved);
}

function updateDeckPagerUI(total) {
  const counter = document.getElementById('deckCounter');
  const fill = document.getElementById('deckProgressFill');
  const prevBtn = document.getElementById('deckPrevBtn');
  const nextBtn = document.getElementById('deckNextBtn');
  if (!counter || !total) return;
  const clamped = Math.max(0, Math.min(state.deckIndex, total - 1));
  state.deckIndex = clamped;
  counter.textContent = `${pad2(clamped + 1)} / ${pad2(total)}`;
  if (fill) fill.style.width = `${Math.max(8, ((clamped + 1) / total) * 100)}%`;
  if (prevBtn) prevBtn.disabled = clamped <= 0;
  if (nextBtn) nextBtn.disabled = clamped >= total - 1;

  document.querySelectorAll('#deckTrack .deck-card').forEach((card, i) => {
    card.classList.toggle('is-active', i === clamped);
  });
}

function scrollToDeckIndex(idx) {
  const track = document.getElementById('deckTrack');
  if (!track) return;
  const cards = track.querySelectorAll('.deck-card');
  if (!cards.length) return;
  const targetIdx = Math.max(0, Math.min(idx, cards.length - 1));
  const target = cards[targetIdx];
  if (!target) return;
  state.deckIndex = targetIdx;
  const left = target.offsetLeft - (track.clientWidth - target.clientWidth) / 2;
  track.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  updateDeckPagerUI(cards.length);
}

function syncFilterControlsUI(matchedCount) {
  const hideDesktop = document.getElementById('hideEndedCheck');
  const audDesktop = document.getElementById('audienceFilter');
  const sortDesktop = document.getElementById('sortSelect');
  const srcDesktop = document.getElementById('sourceFilter');
  if (hideDesktop) hideDesktop.checked = state.hideEnded;
  if (audDesktop) audDesktop.value = state.audienceFilter;
  if (sortDesktop) sortDesktop.value = state.sortBy;
  if (srcDesktop) srcDesktop.value = state.source;

  const hideMobile = document.getElementById('fsHideEndedCheck');
  const srcMobile = document.getElementById('fsSourceSelect');
  if (hideMobile) hideMobile.checked = state.hideEnded;
  if (srcMobile) srcMobile.value = state.source;

  document.querySelectorAll('#fsSortPills .fs-pill').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.sort === state.sortBy);
  });
  document.querySelectorAll('#fsAudiencePills .fs-pill').forEach((btn) => {
    btn.classList.toggle('active', (btn.dataset.audience || '') === state.audienceFilter);
  });

  let activeCount = 0;
  if (state.hideEnded) activeCount += 1;
  if (state.audienceFilter) activeCount += 1;
  if (state.source) activeCount += 1;
  if (state.sortBy !== 'smart') activeCount += 1;

  const mfBtn = document.getElementById('mobileFilterBtn');
  const mfBadge = document.getElementById('mobileFilterBadge');
  if (mfBtn) mfBtn.classList.toggle('has-active', activeCount > 0);
  if (mfBadge) {
    mfBadge.textContent = String(activeCount);
    mfBadge.classList.toggle('hidden', activeCount === 0);
  }

  const doneBtn = document.getElementById('fsDoneBtn');
  if (doneBtn && typeof matchedCount === 'number') {
    doneBtn.textContent = `查看 ${matchedCount} 项活动`;
  }
}

function renderFilteredLocal(opts = {}) {
  const animate = Boolean(opts.animate);
  const grid = document.getElementById('activitiesGrid');
  const deckStage = document.getElementById('deckStage');
  const deckTrack = document.getElementById('deckTrack');
  const deckPager = document.getElementById('deckPager');
  const items = sortItemsLocally(filterItemsLocally(state.allItems));
  state.renderedItems = items;

  syncFilterControlsUI(items.length);
  renderRadarBar();
  updateFavDockUI();

  const emptyMsg = state.onlySaved
    ? '待抢清单暂时为空，点击卡片上的 ☆ 即可收藏'
    : '暂无符合条件的活动';

  if (state.viewMode === 'deck') {
    grid.classList.add('hidden');
    deckStage.classList.remove('hidden');
    if (!items.length) {
      deckTrack.innerHTML = `<div class="empty-box" style="width:100%">${emptyMsg}</div>`;
      if (deckPager) deckPager.classList.add('hidden');
    } else {
      if (deckPager) deckPager.classList.remove('hidden');
      if (state.deckIndex >= items.length) state.deckIndex = 0;
      deckTrack.innerHTML = items.map((it, i) => renderDeckCard(it, i, state.deckIndex)).join('');
      updateDeckPagerUI(items.length);
    }
  } else {
    deckStage.classList.add('hidden');
    grid.classList.remove('hidden');
    if (!items.length) {
      grid.innerHTML = `<div class="empty-box">${emptyMsg}</div>`;
    } else {
      grid.innerHTML = items.map((it, i) => renderCard(it, i, animate)).join('');
    }
  }

  if (state.activeDetailId !== null) {
    const current = state.allItems.find((a) => a.id === state.activeDetailId);
    if (current) renderDetailSheetContent(current);
  }
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

/* ==================== 底部抽屉（详情 & 筛选） ==================== */
function syncBodySheetLock() {
  const anyOpen = Boolean(document.querySelector('.sheet-backdrop.open'));
  document.body.classList.toggle('sheet-open', anyOpen);
}

function openSheet(sheetId) {
  const el = document.getElementById(sheetId);
  if (!el) return;
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  syncBodySheetLock();
}

function closeSheet(sheetId) {
  const el = document.getElementById(sheetId);
  if (!el) return;
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  const panel = el.querySelector('.sheet-panel');
  if (panel) {
    panel.classList.remove('dragging');
    panel.style.transform = '';
  }
  if (sheetId === 'detailSheet') state.activeDetailId = null;
  syncBodySheetLock();
}

function attachSheetSwipeDismiss(sheetId) {
  const backdrop = document.getElementById(sheetId);
  if (!backdrop) return;
  const panel = backdrop.querySelector('.sheet-panel');
  const body = backdrop.querySelector('.sheet-body');
  if (!panel) return;

  let startY = 0;
  let currentDy = 0;
  let tracking = false;

  panel.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      const inHandle = Boolean(e.target.closest('.sheet-handle-area, .sheet-head'));
      if (!inHandle && body && body.scrollTop > 2) return;
      startY = e.touches[0].clientY;
      currentDy = 0;
      tracking = true;
    },
    { passive: true }
  );

  panel.addEventListener(
    'touchmove',
    (e) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        if (currentDy > 0) {
          currentDy = 0;
          panel.style.transform = '';
        }
        return;
      }
      if (body && body.scrollTop > 2) {
        tracking = false;
        panel.classList.remove('dragging');
        panel.style.transform = '';
        return;
      }
      currentDy = dy;
      panel.classList.add('dragging');
      panel.style.transform = `translate3d(0, ${Math.min(dy, 420)}px, 0)`;
    },
    { passive: true }
  );

  const finishSwipe = () => {
    if (!tracking) return;
    tracking = false;
    panel.classList.remove('dragging');
    if (currentDy > 85) {
      closeSheet(sheetId);
    } else {
      panel.style.transform = '';
    }
    currentDy = 0;
  };

  panel.addEventListener('touchend', finishSwipe, { passive: true });
  panel.addEventListener('touchcancel', finishSwipe, { passive: true });
}

function renderDetailSheetContent(item) {
  const primary = (item.tags || [])[0];
  const accent = safeColor(primary?.color);
  const regSt = getRegistrationStatus(item);
  const isUncertain = Boolean(item.is_uncertain) || (item.tags || []).some((t) => /存疑/.test(t.name));
  const rem = state.reminders[item.id];
  const isArmed = Boolean(rem && !rem.fired);
  const aud = getAudienceObj(item);
  const audText = item.audience_text || (aud.scope === 'all' ? '全校可报' : '人群详见推文');

  let audClass = 'unknown';
  if (aud.clubOnly) audClass = 'club';
  else if (aud.scope === 'all') audClass = 'all';
  else if (aud.scope === 'restricted') audClass = 'restricted';

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

  const pubDisplay = formatFullTime(item.published_at) || '—';
  const creditText =
    item.credit_hint || (isUncertain ? '二课类别存疑 · 可自行联系主办方询问' : '');
  const jumpUrl = safeHref(item.source_article_url);

  document.getElementById('dsAccentBar').style.background = accent;
  document.getElementById('dsHeadMeta').innerHTML = `
    ${tagsHtml}
    <span class="reg-pill ${regSt.kind}" data-reg-pill="${item.id}">${escapeHtml(regSt.label)}</span>
  `;

  document.getElementById('dsBody').innerHTML = `
    <h2 class="ds-title" id="dsTitle">${escapeHtml(item.title)}</h2>
    <div class="ds-badges">
      <span class="audience-badge ${audClass}">👥 面向人群：${escapeHtml(audText)}</span>
    </div>
    ${
      creditText
        ? `<div class="ds-credit-card ${isUncertain ? 'uncertain' : ''}">${
            isUncertain ? '⚠️ ' : '✦ 二课说明：'
          }${escapeHtml(creditText)}</div>`
        : ''
    }
    <div class="ds-time-card">
      <div class="time-row">
        <span class="time-key">报名时间</span>
        <span class="time-val ${item.reg_time_text || item.reg_start_at || item.reg_end_at ? 'reg-highlight' : 'muted'}">${escapeHtml(
          regDisplay
        )}</span>
      </div>
      ${
        item.event_time
          ? `<div class="time-row"><span class="time-key">活动时间</span><span class="time-val">${escapeHtml(
              item.event_time
            )}</span></div>`
          : ''
      }
      ${
        item.location
          ? `<div class="time-row"><span class="time-key">活动地点</span><span class="time-val muted">${escapeHtml(
              item.location
            )}</span></div>`
          : ''
      }
      <div class="time-row">
        <span class="time-key">发布时间</span>
        <span class="time-val muted">${escapeHtml(pubDisplay)}</span>
      </div>
    </div>
    <div class="ds-source-card">
      <div class="avatar" style="width:34px;height:34px;border-radius:9px;font-size:14px;${avatarStyle(
        item.source_account_name
      )}">${escapeHtml(avatarChar(item.source_account_name))}</div>
      <div class="ds-source-info">
        <div class="ds-source-name">${escapeHtml(item.source_account_name)}</div>
        <div class="ds-source-article">原推文：《${escapeHtml(item.source_article_title || item.title)}》</div>
      </div>
    </div>
    <div class="ds-quick-tools">
      <button type="button" class="ds-tool-chip ${state.savedIds.has(item.id) ? 'saved' : ''}" data-star-id="${item.id}">
        ${state.savedIds.has(item.id) ? '★ 已在待抢清单' : '☆ 收藏到待抢'}
      </button>
      <button type="button" class="ds-tool-chip" data-poster-id="${item.id}">
        🖼 生成分享海报
      </button>
    </div>
  `;

  document.getElementById('dsFoot').innerHTML = `
    <button type="button" class="sheet-btn sheet-btn-secondary ${isArmed ? 'armed' : ''}" data-remind-id="${item.id}">
      ${isArmed ? '✓ 已设提醒（修改）' : '🔔 静音提醒'}
    </button>
    ${
      jumpUrl
        ? `<a class="sheet-btn sheet-btn-primary" style="background:${accent}" href="${escapeHtml(
            jumpUrl
          )}" target="_blank" rel="noopener noreferrer">阅读原推文 ↗</a>`
        : ''
    }
  `;
}

/* ==================== 纯前端二维码 + 分享海报图生成 ==================== */
function makeQrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text || '')));
  const SPECS = [
    { v: 1, size: 21, dataCw: 19, ec: 7, blocks: 1, align: [] },
    { v: 2, size: 25, dataCw: 34, ec: 10, blocks: 1, align: [6, 18] },
    { v: 3, size: 29, dataCw: 55, ec: 15, blocks: 1, align: [6, 22] },
    { v: 4, size: 33, dataCw: 80, ec: 20, blocks: 1, align: [6, 26] },
    { v: 5, size: 37, dataCw: 108, ec: 26, blocks: 1, align: [6, 30] },
    { v: 6, size: 41, dataCw: 136, ec: 18, blocks: 2, align: [6, 34] },
  ];
  const spec = SPECS.find((s) => bytes.length <= s.dataCw - 2);
  if (!spec) return null;

  // 1. Bit stream: Byte mode (0100) + 8-bit length + UTF-8 bytes + terminator + pad
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);
  const maxBits = spec.dataCw * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const dataBytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    dataBytes.push(v);
  }
  const padSeq = [0xec, 0x11];
  let pi = 0;
  while (dataBytes.length < spec.dataCw) {
    dataBytes.push(padSeq[pi % 2]);
    pi += 1;
  }

  // 2. Reed-Solomon GF(256)
  const gfMul = (a, b) => {
    let r = 0;
    let x = a;
    let y = b;
    while (y > 0) {
      if (y & 1) r ^= x;
      x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
      y >>= 1;
    }
    return r;
  };
  let gen = [1];
  let root = 1;
  for (let i = 0; i < spec.ec; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], root);
    }
    gen = next;
    root = gfMul(root, 2);
  }
  const rsEncode = (chunk) => {
    const rem = new Array(spec.ec).fill(0);
    for (const b of chunk) {
      const factor = b ^ rem[0];
      rem.shift();
      rem.push(0);
      for (let j = 0; j < spec.ec; j++) rem[j] ^= gfMul(gen[j + 1], factor);
    }
    return rem;
  };

  // 3. Split blocks & interleave
  const blkLen = spec.dataCw / spec.blocks;
  const dBlocks = [];
  const eBlocks = [];
  for (let b = 0; b < spec.blocks; b++) {
    const chunk = dataBytes.slice(b * blkLen, (b + 1) * blkLen);
    dBlocks.push(chunk);
    eBlocks.push(rsEncode(chunk));
  }
  const finalCw = [];
  for (let i = 0; i < blkLen; i++) {
    for (let b = 0; b < spec.blocks; b++) finalCw.push(dBlocks[b][i]);
  }
  for (let i = 0; i < spec.ec; i++) {
    for (let b = 0; b < spec.blocks; b++) finalCw.push(eBlocks[b][i]);
  }

  // 4. Build matrix & function patterns
  const N = spec.size;
  const mat = Array.from({ length: N }, () => new Array(N).fill(0));
  const isFn = Array.from({ length: N }, () => new Array(N).fill(false));
  const setFn = (r, c, v) => {
    if (r < 0 || c < 0 || r >= N || c >= N) return;
    mat[r][c] = v ? 1 : 0;
    isFn[r][c] = true;
  };

  const drawFinder = (r0, c0) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || c < 0 || r >= N || c >= N) continue;
        const inBorder = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const onOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFn(r, c, inBorder && (onOuter || inCenter));
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, N - 7);
  drawFinder(N - 7, 0);

  for (let i = 8; i < N - 8; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  for (const ar of spec.align) {
    for (const ac of spec.align) {
      if (isFn[ar][ac]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          setFn(ar + dr, ac + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }
  setFn(N - 8, 8, 1);

  // Reserve format areas
  for (let i = 0; i <= 8; i++) {
    if (!isFn[8][i]) setFn(8, i, 0);
    if (!isFn[i][8]) setFn(i, 8, 0);
  }
  for (let i = 0; i < 8; i++) {
    if (!isFn[8][N - 1 - i]) setFn(8, N - 1 - i, 0);
    if (!isFn[N - 1 - i][8]) setFn(N - 1 - i, 8, 0);
  }

  // 5. Place data bits
  const allBits = [];
  for (const cw of finalCw) {
    for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1);
  }
  let bi = 0;
  let up = true;
  for (let col = N - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;
    for (let step = 0; step < N; step++) {
      const r = up ? N - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!isFn[r][c]) {
          mat[r][c] = bi < allBits.length ? allBits[bi++] : 0;
        }
      }
    }
    up = !up;
  }

  // 6. Pick best mask (0..7)
  const maskFns = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];
  const writeFormat = (grid, maskIdx) => {
    const d = (0b01 << 3) | maskIdx;
    let rem = d << 10;
    for (let i = 4; i >= 0; i--) {
      if ((rem >> (i + 10)) & 1) rem ^= 0x537 << i;
    }
    const fmt = ((d << 10) | rem) ^ 0x5412;
    const bit = (idx) => (fmt >> idx) & 1;
    const tlCoords = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
      [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    ];
    for (let i = 0; i < 15; i++) {
      const [r, c] = tlCoords[i];
      grid[r][c] = bit(14 - i);
    }
    for (let i = 0; i < 7; i++) grid[N - 1 - i][8] = bit(14 - i);
    for (let i = 0; i < 8; i++) grid[8][N - 8 + i] = bit(7 - i);
  };

  let bestGrid = null;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const g = mat.map((row, r) => row.map((v, c) => (!isFn[r][c] && maskFns[m](r, c) ? v ^ 1 : v)));
    writeFormat(g, m);
    let score = 0;
    let dark = 0;
    for (let r = 0; r < N; r++) {
      let runR = 1;
      let runC = 1;
      for (let c = 0; c < N; c++) {
        dark += g[r][c];
        if (c > 0) {
          if (g[r][c] === g[r][c - 1]) runR += 1;
          else {
            if (runR >= 5) score += 3 + (runR - 5);
            runR = 1;
          }
          if (g[c][r] === g[c - 1][r]) runC += 1;
          else {
            if (runC >= 5) score += 3 + (runC - 5);
            runC = 1;
          }
        }
        if (r > 0 && c > 0 && g[r][c] === g[r - 1][c] && g[r][c] === g[r][c - 1] && g[r][c] === g[r - 1][c - 1]) {
          score += 3;
        }
      }
      if (runR >= 5) score += 3 + (runR - 5);
      if (runC >= 5) score += 3 + (runC - 5);
    }
    score += Math.abs(Math.round((dark * 100) / (N * N)) - 50) * 2;
    if (score < bestScore) {
      bestScore = score;
      bestGrid = g;
    }
  }
  return bestGrid;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapCanvasText(ctx, text, maxWidth, maxLines) {
  const chars = Array.from(String(text || ''));
  const lines = [];
  let cur = '';
  for (const ch of chars) {
    if (ch === '\n') {
      lines.push(cur);
      cur = '';
      if (lines.length >= maxLines) break;
      continue;
    }
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
      if (lines.length >= maxLines) {
        lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
        return lines;
      }
    } else {
      cur = test;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

function generatePosterDataUrl(item) {
  const info = getItemDisplayInfo(item);
  const { accent, regSt, audText, regDisplay, creditText, jumpUrl } = info;
  const tagName = (item.tags || [])[0]?.name || '二课活动';
  const W = 750;
  const H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(0.42, '#111c36');
  bgGrad.addColorStop(1, '#090e1c');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Atmospheric accent orbs
  const orb1 = ctx.createRadialGradient(130, 110, 20, 130, 110, 340);
  orb1.addColorStop(0, accent + '66');
  orb1.addColorStop(1, accent + '00');
  ctx.fillStyle = orb1;
  ctx.fillRect(0, 0, W, 500);

  const orb2 = ctx.createRadialGradient(640, 240, 10, 640, 240, 280);
  orb2.addColorStop(0, '#38bdf844');
  orb2.addColorStop(1, '#38bdf800');
  ctx.fillStyle = orb2;
  ctx.fillRect(250, 0, 500, 520);

  // Header brand & status pill
  ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText('✦ 北化二课活动 · 实时汇', 48, 76);

  ctx.font = '700 22px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
  const statusText = regSt.label || '查看详情';
  const stW = ctx.measureText(statusText).width + 34;
  drawRoundedRect(ctx, W - 48 - stW, 46, stW, 42, 21);
  ctx.fillStyle = regSt.kind === 'urgent' ? 'rgba(239,68,68,0.28)' : 'rgba(255,255,255,0.14)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(statusText, W - 48 - stW + 17, 74);

  // Main glass card container
  drawRoundedRect(ctx, 36, 116, W - 72, H - 156, 30);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Top color ribbon inside card
  ctx.save();
  drawRoundedRect(ctx, 36, 116, W - 72, H - 156, 30);
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(36, 116, W - 72, 12);
  ctx.restore();

  let y = 178;
  // Tag pill + Audience pill
  ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
  const tagW = ctx.measureText(tagName).width + 36;
  drawRoundedRect(ctx, 72, y - 30, tagW, 44, 22);
  ctx.fillStyle = accent + '20';
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillText(tagName, 90, y);

  const audLabel = `👥 ${audText}`;
  const audW = Math.min(ctx.measureText(audLabel).width + 32, W - 144 - tagW - 14);
  if (audW > 80) {
    drawRoundedRect(ctx, 72 + tagW + 14, y - 30, audW, 44, 22);
    ctx.fillStyle = '#f1f5f9';
    ctx.fill();
    ctx.fillStyle = '#334155';
    const clippedAud = wrapCanvasText(ctx, audLabel, audW - 24, 1)[0] || audLabel;
    ctx.fillText(clippedAud, 72 + tagW + 28, y);
  }

  y += 58;
  // Activity Title
  ctx.font = '800 40px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#0f172a';
  const titleLines = wrapCanvasText(ctx, item.title, W - 144, 3);
  for (const line of titleLines) {
    ctx.fillText(line, 72, y);
    y += 56;
  }

  // Credit box if present
  if (creditText) {
    y += 8;
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    const creditLines = wrapCanvasText(ctx, `✦ ${creditText}`, W - 188, 2);
    const boxH = creditLines.length * 36 + 30;
    drawRoundedRect(ctx, 72, y, W - 144, boxH, 16);
    ctx.fillStyle = accent + '14';
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    let cy = y + 40;
    for (const cl of creditLines) {
      ctx.fillText(cl, 94, cy);
      cy += 36;
    }
    y += boxH + 22;
  } else {
    y += 12;
  }

  // Structured Time & Source info box
  const rows = [
    { k: '报名时间', v: regDisplay, hi: true },
    ...(item.event_time ? [{ k: '活动时间', v: item.event_time, hi: false }] : []),
    ...(item.location ? [{ k: '活动地点', v: item.location, hi: false }] : []),
    { k: '来源公众号', v: item.source_account_name || '校内公众号', hi: false },
  ];
  const infoBoxH = rows.length * 58 + 32;
  drawRoundedRect(ctx, 72, y, W - 144, infoBoxH, 20);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.stroke();

  let ry = y + 52;
  for (const row of rows) {
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(row.k, 98, ry);

    ctx.font = row.hi
      ? '700 25px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
      : '600 24px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = row.hi ? accent : '#0f172a';
    const valLine = wrapCanvasText(ctx, row.v, W - 340, 1)[0] || row.v;
    const vw = ctx.measureText(valLine).width;
    ctx.fillText(valLine, W - 98 - vw, ry);
    ry += 58;
  }

  // Footer divider + Real Scannable QR Code
  const footY = H - 252;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(72, footY);
  ctx.lineTo(W - 72, footY);
  ctx.stroke();
  ctx.setLineDash([]);

  const qrTarget = jumpUrl && new TextEncoder().encode(jumpUrl).length <= 134 ? jumpUrl : HUB_PUBLIC_URL;
  const qrMat = makeQrMatrix(qrTarget) || makeQrMatrix(HUB_PUBLIC_URL);
  const qrBoxSize = 158;
  const qrX = W - 72 - qrBoxSize;
  const qrY = footY + 26;

  drawRoundedRect(ctx, qrX - 10, qrY - 10, qrBoxSize + 20, qrBoxSize + 20, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (qrMat) {
    const N = qrMat.length;
    const cell = qrBoxSize / N;
    ctx.fillStyle = '#0f172a';
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (qrMat[r][c]) {
          ctx.fillRect(
            Math.floor(qrX + c * cell),
            Math.floor(qrY + r * cell),
            Math.ceil(cell),
            Math.ceil(cell)
          );
        }
      }
    }
  }

  ctx.font = '800 28px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(qrTarget === jumpUrl ? '扫码直达原推文' : '扫码查看北化二课汇', 72, footY + 76);

  ctx.font = '500 21px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('长按识别二维码 · 抢先一步不错过', 72, footY + 116);

  ctx.font = '600 19px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('buct-activities · 实时聚合', 72, footY + 158);

  return canvas.toDataURL('image/png');
}

function openPosterModal(item) {
  state.posterItem = item;
  state.posterDataUrl = generatePosterDataUrl(item);
  const img = document.getElementById('posterPreviewImg');
  if (img) img.src = state.posterDataUrl;
  const copyBtn = document.getElementById('posterCopyBtn');
  if (copyBtn) copyBtn.textContent = '🔗 复制推文链接';
  document.getElementById('posterModal').classList.remove('hidden');
  haptic(12);
}

function closePosterModal() {
  document.getElementById('posterModal').classList.add('hidden');
  state.posterItem = null;
}

function toggleSavedItem(id, triggerBtn) {
  if (state.savedIds.has(id)) {
    state.savedIds.delete(id);
  } else {
    state.savedIds.add(id);
  }
  persistSavedIds();
  haptic(12);
  if (triggerBtn) {
    triggerBtn.classList.add('pop');
    setTimeout(() => triggerBtn.classList.remove('pop'), 180);
  }
  renderFilteredLocal();
}

function openDetailSheet(item) {
  state.activeDetailId = item.id;
  renderDetailSheetContent(item);
  openSheet('detailSheet');
  haptic(8);
}

/* ==================== 事件绑定 ==================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

document.getElementById('viewModeBtn').addEventListener('click', () => {
  state.viewMode = state.viewMode === 'deck' ? 'grid' : 'deck';
  persistViewMode();
  updateViewModeButtonUI();
  haptic(12);
  renderFilteredLocal({ animate: true });
});

document.getElementById('tagBar').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  state.tagId = btn.dataset.tagId || '';
  state.deckIndex = 0;
  haptic(8);
  renderTagBar();
  renderFilteredLocal({ animate: true });
});

document.getElementById('sourceFilter').addEventListener('change', (e) => {
  state.source = e.target.value;
  state.deckIndex = 0;
  renderFilteredLocal({ animate: true });
});

document.getElementById('audienceFilter').addEventListener('change', (e) => {
  state.audienceFilter = e.target.value;
  state.deckIndex = 0;
  renderFilteredLocal({ animate: true });
});

document.getElementById('sortSelect').addEventListener('change', (e) => {
  state.sortBy = e.target.value || 'smart';
  state.deckIndex = 0;
  renderFilteredLocal({ animate: true });
});

document.getElementById('hideEndedCheck').addEventListener('change', (e) => {
  state.hideEnded = e.target.checked;
  state.deckIndex = 0;
  renderFilteredLocal({ animate: true });
});

// 移动端底部筛选抽屉事件（方案 C）
document.getElementById('mobileFilterBtn').addEventListener('click', () => {
  syncFilterControlsUI(filterItemsLocally(state.allItems).length);
  openSheet('filterSheet');
  haptic(8);
});

document.getElementById('fsSortPills').addEventListener('click', (e) => {
  const btn = e.target.closest('.fs-pill');
  if (!btn) return;
  state.sortBy = btn.dataset.sort || 'smart';
  state.deckIndex = 0;
  haptic(8);
  renderFilteredLocal({ animate: true });
});

document.getElementById('fsAudiencePills').addEventListener('click', (e) => {
  const btn = e.target.closest('.fs-pill');
  if (!btn) return;
  state.audienceFilter = btn.dataset.audience || '';
  state.deckIndex = 0;
  haptic(8);
  renderFilteredLocal({ animate: true });
});

document.getElementById('fsSourceSelect').addEventListener('change', (e) => {
  state.source = e.target.value;
  state.deckIndex = 0;
  renderFilteredLocal({ animate: true });
});

document.getElementById('fsHideEndedCheck').addEventListener('change', (e) => {
  state.hideEnded = e.target.checked;
  state.deckIndex = 0;
  renderFilteredLocal({ animate: true });
});

document.getElementById('fsResetBtn').addEventListener('click', () => {
  state.sortBy = 'smart';
  state.audienceFilter = '';
  state.source = '';
  state.hideEnded = false;
  state.onlySaved = false;
  state.deckIndex = 0;
  haptic(10);
  renderFilteredLocal({ animate: true });
});

document.getElementById('fsDoneBtn').addEventListener('click', () => closeSheet('filterSheet'));

// 急抢雷达点击直达详情
document.getElementById('radarTrack').addEventListener('click', (e) => {
  const pill = e.target.closest('[data-radar-id]');
  if (!pill) return;
  const id = Number(pill.dataset.radarId);
  const item = state.allItems.find((a) => a.id === id);
  if (item) openDetailSheet(item);
});

// 悬浮待抢清单胶囊
document.getElementById('favDockToggle').addEventListener('click', () => {
  state.onlySaved = !state.onlySaved;
  state.deckIndex = 0;
  haptic(10);
  renderFilteredLocal({ animate: true });
});

document.getElementById('favDockAllBtn').addEventListener('click', () => {
  state.onlySaved = false;
  state.deckIndex = 0;
  haptic(8);
  renderFilteredLocal({ animate: true });
});

// 沉浸横滑翻卡事件（被动监听 scroll 更新页码与聚焦缩放）
const deckTrackEl = document.getElementById('deckTrack');
let deckScrollRaf = 0;
deckTrackEl.addEventListener(
  'scroll',
  () => {
    if (deckScrollRaf) return;
    deckScrollRaf = requestAnimationFrame(() => {
      deckScrollRaf = 0;
      const cards = deckTrackEl.querySelectorAll('.deck-card');
      if (!cards.length) return;
      const center = deckTrackEl.scrollLeft + deckTrackEl.clientWidth / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      cards.forEach((c, i) => {
        const mid = c.offsetLeft + c.clientWidth / 2;
        const d = Math.abs(mid - center);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      if (bestIdx !== state.deckIndex) {
        state.deckIndex = bestIdx;
        updateDeckPagerUI(cards.length);
      }
    });
  },
  { passive: true }
);

document.getElementById('deckPrevBtn').addEventListener('click', () => {
  haptic(8);
  scrollToDeckIndex(state.deckIndex - 1);
});

document.getElementById('deckNextBtn').addEventListener('click', () => {
  haptic(8);
  scrollToDeckIndex(state.deckIndex + 1);
});

// 海报弹窗按钮
document.getElementById('posterClose').addEventListener('click', closePosterModal);
document.getElementById('posterModal').addEventListener('click', (e) => {
  if (e.target.id === 'posterModal') closePosterModal();
});
document.getElementById('posterDownloadBtn').addEventListener('click', () => {
  if (!state.posterDataUrl || !state.posterItem) return;
  const a = document.createElement('a');
  a.href = state.posterDataUrl;
  a.download = `${(state.posterItem.title || 'buct-activity').replace(/[\\/:*?"<>|]/g, '').slice(0, 26)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  haptic(12);
});
document.getElementById('posterCopyBtn').addEventListener('click', async () => {
  if (!state.posterItem) return;
  const url = safeHref(state.posterItem.source_article_url) || HUB_PUBLIC_URL;
  const text = `【${state.posterItem.title}】${url}`;
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById('posterCopyBtn').textContent = '✓ 已复制链接';
    haptic(10);
  } catch {
    prompt('请复制下方活动链接：', text);
  }
});

// 通用抽屉关闭（点击遮罩、关闭按钮、下滑、Esc）
['filterSheet', 'detailSheet'].forEach((sheetId) => {
  const el = document.getElementById(sheetId);
  if (!el) return;
  el.addEventListener('click', (e) => {
    if (e.target === el) closeSheet(sheetId);
    const closeBtn = e.target.closest('[data-sheet-close]');
    if (closeBtn) closeSheet(closeBtn.dataset.sheetClose);
  });
  attachSheetSwipeDismiss(sheetId);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!document.getElementById('posterModal').classList.contains('hidden')) {
    closePosterModal();
  } else if (!document.getElementById('remindModal').classList.contains('hidden')) {
    closeRemindModal();
  } else if (document.getElementById('detailSheet').classList.contains('open')) {
    closeSheet('detailSheet');
  } else if (document.getElementById('filterSheet').classList.contains('open')) {
    closeSheet('filterSheet');
  }
});

let searchTimer = null;
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = e.target.value.trim();
    state.deckIndex = 0;
    renderFilteredLocal();
  }, 150);
});

function handleCardActionClick(e) {
  const starBtn = e.target.closest('[data-star-id]');
  if (starBtn) {
    toggleSavedItem(Number(starBtn.dataset.starId), starBtn);
    return true;
  }
  const posterBtn = e.target.closest('[data-poster-id]');
  if (posterBtn) {
    const item = state.allItems.find((a) => a.id === Number(posterBtn.dataset.posterId));
    if (item) openPosterModal(item);
    return true;
  }
  const remBtn = e.target.closest('[data-remind-id]');
  if (remBtn) {
    const item = state.allItems.find((a) => a.id === Number(remBtn.dataset.remindId));
    if (item) openRemindModal(item);
    return true;
  }
  const openDetailBtn = e.target.closest('[data-open-detail-id]');
  if (openDetailBtn) {
    const item = state.allItems.find((a) => a.id === Number(openDetailBtn.dataset.openDetailId));
    if (item) openDetailSheet(item);
    return true;
  }
  return false;
}

document.getElementById('activitiesGrid').addEventListener('click', (e) => {
  if (handleCardActionClick(e)) return;
  if (e.target.closest('a, button')) return;
  const card = e.target.closest('.act-card[data-card-id]');
  if (!card) return;
  const item = state.allItems.find((a) => a.id === Number(card.dataset.cardId));
  if (item) openDetailSheet(item);
});

deckTrackEl.addEventListener('click', (e) => {
  if (handleCardActionClick(e)) return;
  if (e.target.closest('a, button')) return;
  const card = e.target.closest('.deck-card[data-card-id]');
  if (!card) return;
  const item = state.allItems.find((a) => a.id === Number(card.dataset.cardId));
  if (item) openDetailSheet(item);
});

document.getElementById('detailSheet').addEventListener('click', (e) => {
  handleCardActionClick(e);
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
loadSavedIds();
loadViewMode();
updateViewModeButtonUI();
syncFilterControlsUI();
const initialCached = loadSnapshotFromCache();
if (initialCached) {
  state.meta = initialCached.meta;
  state.allItems = initialCached.allItems;
  state.lastSyncedAt = initialCached.cachedAt;
  applyMetaToDom();
  renderFilteredLocal();
}

refreshAll();

// 每秒更新倒计时胶囊（卡片 + 详情抽屉 + 急抢雷达） & 检查静音提醒
setInterval(() => {
  for (const item of state.allItems) {
    const pillEls = document.querySelectorAll(`[data-reg-pill="${item.id}"]`);
    const radarEls = document.querySelectorAll(`[data-radar-time="${item.id}"]`);
    if (!pillEls.length && !radarEls.length) continue;
    const st = getRegistrationStatus(item);
    pillEls.forEach((el) => {
      el.className = `reg-pill ${st.kind}`;
      el.textContent = st.label;
    });
    radarEls.forEach((el) => {
      el.className = `radar-pill-time ${st.kind}`;
      el.textContent = st.label;
    });
  }
  checkDueReminders();
}, 1000);

setInterval(() => {
  if (state.meta) updateFreshnessUI();
}, 30 * 1000);
setInterval(refreshAll, 60 * 1000);
