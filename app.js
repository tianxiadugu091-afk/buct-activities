const CACHE_KEY = 'wah_public_snapshot_v2';
const REMIND_KEY = 'wah_silent_reminders_v1';
const PROFILE_KEY = 'wah_user_profile_v1';
const VIEW_MODE_KEY = 'wah_view_mode_v1';
const THEME_KEY = 'wah_theme';
const IS_STATIC_HOST =
  window.location.protocol === 'file:' ||
  /\.(github\.io|pages\.dev|vercel\.app|netlify\.app|gitee\.io)$/i.test(window.location.hostname);

const DEFAULT_PROFILE = {
  degreeGrade: '', // '' | 'freshman' | 'upper' | 'grad'
  college: '',
  campus: '',      // '' | 'changping' | 'chaoyang' | 'haidian'
  isLeague: false,
  isParty: false,
  showClubOnly: false,
};

function resolveInitialViewMode() {
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === 'shelf' || saved === 'grid') return saved;
  } catch {}
  return window.innerWidth <= 760 ? 'shelf' : 'grid';
}

const state = {
  tagId: '',
  source: '',
  audienceFilter: '',
  sortBy: 'smart',
  onlyEligible: false,
  q: '',
  hideEnded: false,
  viewMode: resolveInitialViewMode(),
  profile: { ...DEFAULT_PROFILE },
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
  shelf: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><path d="M8 7h6"/></svg>',
  grid: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
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

/* ==================== 身份画像与人群匹配引擎 ==================== */
function hasConfiguredProfile(p) {
  if (!p) return false;
  return Boolean(p.degreeGrade || p.college || p.campus || p.isLeague || p.isParty);
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      state.profile = { ...DEFAULT_PROFILE, ...parsed.profile };
      state.onlyEligible = Boolean(parsed.onlyEligible && hasConfiguredProfile(state.profile));
    }
  } catch {}
}

function saveProfile() {
  try {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({ profile: state.profile, onlyEligible: state.onlyEligible })
    );
  } catch {}
}

function updateProfileButtonUI() {
  const btn = document.getElementById('profileBtn');
  const txt = document.getElementById('profileBtnText');
  const eligibleCheck = document.getElementById('onlyEligibleCheck');
  if (!btn || !txt) return;

  const p = state.profile;
  const configured = hasConfiguredProfile(p);
  btn.classList.toggle('configured', configured);

  if (!configured) {
    txt.textContent = '👤 我的身份';
  } else {
    const segs = [];
    if (p.college) segs.push(p.college.replace(/学院|书院|系$/, ''));
    if (p.degreeGrade === 'freshman') segs.push('大一');
    else if (p.degreeGrade === 'upper') segs.push('本科');
    else if (p.degreeGrade === 'grad') segs.push('研究生');
    if (!segs.length && p.campus) {
      segs.push(p.campus === 'changping' ? '昌平' : p.campus === 'chaoyang' ? '朝阳' : '海淀');
    }
    if (!segs.length) segs.push(p.isParty ? '党员' : '团员');
    txt.textContent = segs.slice(0, 2).join('·');
  }

  if (eligibleCheck) {
    eligibleCheck.checked = state.onlyEligible;
  }
}

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

function evaluateEligibility(item, profile) {
  const aud = getAudienceObj(item);
  if (!aud || aud.scope === 'unknown') {
    return { status: 'unknown', reason: '' };
  }
  if (aud.clubOnly) {
    return profile.showClubOnly
      ? { status: 'eligible', reason: '' }
      : { status: 'ineligible', reason: '仅限社团内部' };
  }
  if (aud.scope === 'all') {
    return { status: 'eligible', reason: '' };
  }

  // College check
  if (Array.isArray(aud.colleges) && aud.colleges.length > 0 && profile.college) {
    if (!aud.colleges.includes(profile.college)) {
      return { status: 'ineligible', reason: `限${aud.colleges.join('/')}` };
    }
  }
  // Grade check
  if (Array.isArray(aud.grades) && aud.grades.length > 0 && profile.degreeGrade) {
    if (aud.grades.includes('freshman') && profile.degreeGrade !== 'freshman') {
      return { status: 'ineligible', reason: '限大一新生' };
    }
    if (aud.grades.includes('upper') && profile.degreeGrade !== 'upper') {
      return { status: 'ineligible', reason: '限非大一本科' };
    }
  }
  // Degree check
  if (Array.isArray(aud.degrees) && aud.degrees.length > 0 && profile.degreeGrade) {
    const userDeg = profile.degreeGrade === 'grad' ? 'grad' : 'undergrad';
    if (!aud.degrees.includes(userDeg)) {
      return { status: 'ineligible', reason: aud.degrees.includes('grad') ? '限研究生' : '限本科生' };
    }
  }
  // Campus check
  if (Array.isArray(aud.campuses) && aud.campuses.length > 0 && profile.campus) {
    if (!aud.campuses.includes(profile.campus)) {
      return { status: 'ineligible', reason: '限其他校区' };
    }
  }
  // Politics check
  if (Array.isArray(aud.politics) && aud.politics.length > 0 && (profile.isLeague || profile.isParty)) {
    const matchedPol =
      (aud.politics.includes('party') && profile.isParty) ||
      (aud.politics.includes('league') && profile.isLeague);
    if (!matchedPol) {
      return { status: 'ineligible', reason: '限特定政治面貌' };
    }
  }

  return { status: 'eligible', reason: '' };
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
  const profileConfigured = hasConfiguredProfile(state.profile);

  return (items || []).filter((item) => {
    const regSt = getRegistrationStatus(item);
    if (state.hideEnded && regSt.ended) return false;
    if (state.onlyEligible) {
      const elig = evaluateEligibility(item, state.profile);
      if (elig.status === 'ineligible') return false;
    }
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

function renderCard(item) {
  const primary = (item.tags || [])[0];
  const accent = safeColor(primary?.color);
  const regSt = getRegistrationStatus(item);
  const isUncertain = Boolean(item.is_uncertain) || (item.tags || []).some((t) => /存疑/.test(t.name));
  const rem = state.reminders[item.id];
  const isArmed = Boolean(rem && !rem.fired);
  const aud = getAudienceObj(item);
  const audText = item.audience_text || (aud.scope === 'all' ? '全校可报' : '人群详见推文');
  const elig = hasConfiguredProfile(state.profile) ? evaluateEligibility(item, state.profile) : { status: 'unknown', reason: '' };

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

        <div class="audience-row">
          <span class="audience-badge ${audClass}">👥 ${escapeHtml(audText)}</span>
          ${
            elig.status === 'ineligible'
              ? `<span class="audience-badge mismatch">✕ 身份不符（${escapeHtml(elig.reason)}）</span>`
              : ''
          }
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

/* ==================== Wenku8 同款 3D 波浪抽书架引擎 ==================== */
const ArchiveWaveShelf = (() => {
  const DEPTH_X = 0.66;
  const DEPTH_Y = -0.30;
  const ROW_STEP = 2.5;
  const WAVE_RADIUS = 1.48;
  const DRAG_RATE = 4.4;
  const OMEGA = 12.0;
  const MIN_FLING_VEL = 50; // px/s
  const HALF_WIN = 9;

  let items = [];
  let focus = 0;
  let entrance = 1;
  let geo = null;
  let poolNodes = [];
  let lastActiveModIdx = -1;
  let lastDetentLane = 0;
  let lastHapticMs = 0;
  let hapticArmed = false;

  let animRaf = 0;
  let entranceRaf = 0;
  let simState = null;

  // Pointer drag state
  let dragPointerId = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartFocus = 0;
  let dragLocked = null; // null | 'h' | 'v'
  let dragMoved = false;
  let velocitySamples = [];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const mod = (n, m) => (m <= 0 ? 0 : ((n % m) + m) % m);

  // Exact Cubic(0.2, 1.06, 0.35, 1) evaluator matching Wenku8 archive_wave.dart
  function evalOvershootCubic(t) {
    const x1 = 0.2, y1 = 1.06, x2 = 0.35, y2 = 1.0;
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    let u = clamp(t, 0, 1);
    for (let i = 0; i < 6; i++) {
      const xu = ((ax * u + bx) * u + cx) * u - t;
      const dx = (3 * ax * u + 2 * bx) * u + cx;
      if (Math.abs(dx) < 1e-5) break;
      u = clamp(u - xu / dx, 0, 1);
    }
    return ((ay * u + by) * u + cy) * u;
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function measure() {
    const stage = document.getElementById('shelfStage');
    if (!stage) return null;
    const rectW = stage.clientWidth || Math.min(window.innerWidth - 24, 520);
    const w = clamp(rectW, 280, 520);
    const spine = Math.round(clamp(w * 0.056, 18, 22));
    const pitch = spine + 12;
    const cover = Math.round(clamp(w * 0.36, 122, 156));
    const height = Math.round(((cover - 20) * 166) / 118 + 62);
    const footprint = spine + cover * DEPTH_X;
    const pullDist = cover * 0.84;
    const baseY = -cover * DEPTH_Y + height * 0.54 + 14;
    const stageHeight = Math.round(baseY + height + 30);
    const startX = w / 2 - footprint / 2 + pullDist * DEPTH_X;
    stage.style.height = `${stageHeight}px`;
    geo = { w, spine, pitch, cover, height, footprint, pullDist, baseY, stageHeight, startX };
    return geo;
  }

  function railY(d) {
    const c = clamp(d, -7, 7);
    return c * ROW_STEP + c * c * 0.45;
  }

  function waveWeight(d) {
    const dist = Math.abs(d);
    if (dist >= WAVE_RADIUS) return 0;
    const v = Math.cos((dist / WAVE_RADIUS) * (Math.PI / 2));
    const crest = entrance >= 1 ? 1 : easeOutCubic((entrance - 0.38) / 0.62);
    return v * v * crest;
  }

  function originFor(weight) {
    const pull = geo.pullDist * weight * (1.24 - 0.24 * weight);
    const lift = weight * weight * (3 - 2 * weight);
    return {
      ox: -pull * DEPTH_X,
      oy: geo.baseY - pull * DEPTH_Y - geo.height * 0.54 * lift,
      lift,
    };
  }

  function assemblyOffset(d) {
    if (entrance >= 1) return { ax: 0, ay: 0 };
    const order = clamp(d + geo.w / geo.pitch / 2 + 2, 0, 16);
    const start = order * 0.018;
    const p = easeOutCubic((entrance - start) / 0.52);
    return {
      ax: DEPTH_X * 56 * (1 - p),
      ay: DEPTH_Y * 56 * (1 - p),
    };
  }

  function spineGlyphHtml(title) {
    const clean = String(title || '活动')
      .replace(/^【[^】]{1,10}】\s*/, '')
      .replace(/^(?:活动预告|讲座预告|劳动实践|志愿招募)[丨|｜:：\-\s]*/i, '')
      .trim();
    const chars = Array.from(clean || String(title || '活动'));
    const shown = chars.length > 7 ? [...chars.slice(0, 7), '…'] : chars;
    return shown.map((c) => `<span>${escapeHtml(c)}</span>`).join('');
  }

  function createBookNode() {
    const vol = document.createElement('div');
    vol.className = 'book-vol';
    vol.innerHTML = `
      <div class="book-shadow"></div>
      <div class="book-cover"></div>
      <div class="book-cap"></div>
      <div class="book-spine"></div>
    `;
    vol._shadow = vol.children[0];
    vol._cover = vol.children[1];
    vol._cap = vol.children[2];
    vol._spine = vol.children[3];
    vol._boundKey = '';
    vol._slot = 0;
    return vol;
  }

  function bindBookContent(vol, item, itemIdx) {
    const key = `${item.id}:${itemIdx}:${geo.spine}x${geo.cover}x${geo.height}`;
    if (vol._boundKey === key) return;
    vol._boundKey = key;

    const primary = (item.tags || [])[0];
    const accent = safeColor(primary?.color);
    const regSt = getRegistrationStatus(item);
    const aud = getAudienceObj(item);
    const audShort = item.audience_text || (aud.scope === 'all' ? '全校可报' : '人群详见推文');
    const numStr = String(itemIdx + 1).padStart(2, '0');
    const noStr = `NO.${String(itemIdx + 1).padStart(3, '0')}`;

    vol.style.setProperty('--book-accent', accent);
    vol.classList.toggle('is-ended', regSt.ended);

    vol._cover.style.width = `${geo.cover}px`;
    vol._cover.style.height = `${geo.height}px`;
    vol._cap.style.width = `${geo.spine}px`;
    vol._cap.style.height = `${geo.cover}px`;
    vol._spine.style.width = `${geo.spine}px`;
    vol._spine.style.height = `${geo.height}px`;
    vol._shadow.style.width = `${geo.spine + 6}px`;
    vol._shadow.style.height = `${Math.round(geo.cover * 0.72)}px`;

    vol._spine.innerHTML = `
      <span class="book-spine-num">${numStr}</span>
      <div class="book-spine-title">${spineGlyphHtml(item.title)}</div>
      <span class="book-spine-dot"></span>
    `;

    vol._cover.innerHTML = `
      <div class="book-cover-head">
        <span class="book-code">${noStr}</span>
        ${primary ? `<span class="book-cover-tag">${escapeHtml(primary.name)}</span>` : ''}
      </div>
      <div class="book-cover-card">
        <div class="book-cover-title">${escapeHtml(item.title)}</div>
        <div class="book-cover-meta">
          <div class="book-cover-aud">👥 ${escapeHtml(audShort)}</div>
          <span class="book-cover-status ${regSt.kind}">${escapeHtml(regSt.label)}</span>
        </div>
      </div>
      <div class="book-cover-foot">
        <span class="book-cover-src">${escapeHtml(item.source_account_name)}</span>
        <span>↗</span>
      </div>
    `;
  }

  function ensurePool(size) {
    const poolEl = document.getElementById('shelfPool');
    if (!poolEl) return;
    while (poolNodes.length < size) {
      const node = createBookNode();
      poolEl.appendChild(node);
      poolNodes.push(node);
    }
    while (poolNodes.length > size) {
      const removed = poolNodes.pop();
      removed.remove();
    }
  }

  function updateActiveReadout(force = false) {
    const count = items.length;
    const counterEl = document.getElementById('shelfCounter');
    const detailEl = document.getElementById('shelfActiveCard');
    const prevBtn = document.getElementById('shelfPrevBtn');
    const nextBtn = document.getElementById('shelfNextBtn');
    if (!count) {
      if (counterEl) counterEl.textContent = '00 / 00';
      if (detailEl) detailEl.innerHTML = '';
      return;
    }

    const roundedLane = Math.round(focus);
    const activeIdx = mod(roundedLane, count);

    // Subtle single detent haptic pulse when entering a new book center (matches archive_wave.dart)
    if (hapticArmed && count > 1 && Math.abs(focus - roundedLane) < 0.14 && roundedLane !== lastDetentLane) {
      const now = performance.now();
      if (now - lastHapticMs >= 65) {
        lastDetentLane = roundedLane;
        lastHapticMs = now;
        try {
          if (navigator.vibrate) navigator.vibrate(8);
        } catch {}
      }
    }

    if (!force && activeIdx === lastActiveModIdx) return;
    lastActiveModIdx = activeIdx;

    if (counterEl) {
      counterEl.textContent = `${String(activeIdx + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`;
    }
    if (prevBtn) prevBtn.disabled = count < 2;
    if (nextBtn) nextBtn.disabled = count < 2;
    if (detailEl) {
      detailEl.innerHTML = renderCard(items[activeIdx]);
    }
  }

  function paint() {
    if (!geo || items.length === 0) return;
    const count = items.length;
    const centerSlot = count < 2 ? 0 : Math.round(focus);
    const startSlot = count < 2 ? 0 : centerSlot - HALF_WIN;
    const slotCount = count < 2 ? 1 : HALF_WIN * 2 + 1;

    ensurePool(slotCount);

    for (let i = 0; i < slotCount; i++) {
      const slot = startSlot + i;
      const itemIdx = count < 2 ? 0 : mod(slot, count);
      const item = items[itemIdx];
      const vol = poolNodes[i];
      vol._slot = slot;
      vol.dataset.slot = String(slot);
      vol.dataset.itemIdx = String(itemIdx);

      bindBookContent(vol, item, itemIdx);

      const d = slot - focus;
      const { ax, ay } = assemblyOffset(d);
      const slotX = geo.startX + d * geo.pitch + ax;
      const slotY = railY(d) + ay;

      // Hide slots completely outside the horizontal bank
      if (slotX + geo.footprint + 40 < -60 || slotX - geo.pullDist * DEPTH_X > geo.w + 80) {
        vol.style.display = 'none';
        continue;
      }
      vol.style.display = '';
      vol.style.zIndex = String(1000 + i);
      vol.style.transform = `translate3d(${slotX.toFixed(2)}px, ${slotY.toFixed(2)}px, 0)`;

      const w = waveWeight(d);
      const { ox, oy, lift } = originFor(w);
      const spineDrop = geo.spine * 0.1;

      vol.classList.toggle('is-focused', Math.abs(d) < 0.28);

      // Exact shared-vertex 2D affine transforms matching Wenku8 ArchiveBoxDepthRender
      vol._cover.style.transform = `matrix(${DEPTH_X}, ${DEPTH_Y}, 0, 1, ${(ox + geo.spine).toFixed(2)}, ${(
        oy + spineDrop
      ).toFixed(2)})`;
      vol._cap.style.transform = `matrix(1, 0.1, ${DEPTH_X}, ${DEPTH_Y}, ${ox.toFixed(2)}, ${oy.toFixed(2)})`;
      vol._spine.style.transform = `matrix(1, 0.1, 0, 1, ${ox.toFixed(2)}, ${oy.toFixed(2)})`;

      // Ground contact shadow softens as the book lifts out of the bank
      vol._shadow.style.transform = `matrix(1, 0.1, ${DEPTH_X}, ${DEPTH_Y}, -4, ${(
        geo.baseY + geo.height + 6
      ).toFixed(2)})`;
      vol._shadow.style.opacity = String((1 - lift * 0.55).toFixed(2));
    }

    updateActiveReadout(false);
  }

  function stopAnim() {
    if (animRaf) {
      cancelAnimationFrame(animRaf);
      animRaf = 0;
    }
    simState = null;
  }

  function finishEntrance() {
    if (entranceRaf) {
      cancelAnimationFrame(entranceRaf);
      entranceRaf = 0;
    }
    if (entrance < 1) {
      entrance = 1;
      paint();
    }
  }

  function playEntrance() {
    if (prefersReducedMotion()) {
      entrance = 1;
      paint();
      return;
    }
    if (entranceRaf) cancelAnimationFrame(entranceRaf);
    entrance = 0;
    const t0 = performance.now();
    const dur = 640;
    const tick = (now) => {
      entrance = clamp((now - t0) / dur, 0, 1);
      paint();
      if (entrance < 1) {
        entranceRaf = requestAnimationFrame(tick);
      } else {
        entranceRaf = 0;
      }
    };
    entranceRaf = requestAnimationFrame(tick);
  }

  function animateToSlot(targetSlot) {
    if (items.length < 2) return;
    finishEntrance();
    stopAnim();
    const startFocus = focus;
    if (Math.abs(targetSlot - startFocus) < 0.002) {
      focus = targetSlot;
      paint();
      return;
    }
    if (prefersReducedMotion()) {
      focus = targetSlot;
      paint();
      updateActiveReadout(true);
      return;
    }
    hapticArmed = true;
    lastDetentLane = Math.round(focus);
    const t0 = performance.now();
    const dur = 320;
    const step = (now) => {
      const p = clamp((now - t0) / dur, 0, 1);
      focus = startFocus + (targetSlot - startFocus) * evalOvershootCubic(p);
      paint();
      if (p < 1) {
        animRaf = requestAnimationFrame(step);
      } else {
        animRaf = 0;
        focus = targetSlot;
        hapticArmed = false;
        paint();
        updateActiveReadout(true);
      }
    };
    animRaf = requestAnimationFrame(step);
  }

  // Exact JS port of Wenku8 ArchiveScrollSimulation (momentum coast -> zero-overshoot cubic landing)
  function startPhysicsScroll(velPxPerSec) {
    if (!geo || items.length < 2) return;
    stopAnim();
    const pitch = geo.pitch;
    const posPx = focus * pitch;
    const speed = Math.abs(velPxPerSec);
    const directional = speed >= MIN_FLING_VEL;
    const release = directional ? velPxPerSec : 0;

    let dest = Math.round((posPx + release / DRAG_RATE) / pitch) * pitch;
    if (directional && (dest - posPx) * Math.sign(release) < speed / OMEGA) {
      const runway = posPx + release / OMEGA;
      dest = (release > 0 ? Math.ceil(runway / pitch) : Math.floor(runway / pitch)) * pitch;
    }

    const handoffSpeed = pitch * 4;
    const coastDuration =
      speed > handoffSpeed && directional ? Math.log(speed / handoffSpeed) / DRAG_RATE : 0;
    const coastX = (t) => posPx + (release / DRAG_RATE) * (1 - Math.exp(-DRAG_RATE * t));
    const coastDx = (t) => release * Math.exp(-DRAG_RATE * t);

    const handoffPos = coastDuration > 0 ? coastX(coastDuration) : posPx;
    const handoffVel = coastDuration > 0 ? coastDx(coastDuration) : release;
    const landingDuration = directional && Math.abs(handoffVel) > 1e-3
      ? Math.max(0.08, (3 * (dest - handoffPos)) / handoffVel)
      : 0;

    const t0 = performance.now();
    hapticArmed = true;

    const step = (now) => {
      const t = (now - t0) / 1000;
      let curPx;
      let done = false;

      if (landingDuration === 0) {
        // Critically damped detent spring with v0 = 0
        const decay = Math.exp(-OMEGA * t);
        curPx = dest + (posPx - dest) * (1 + OMEGA * t) * decay;
        if (Math.abs(curPx - dest) < 0.08 || t > 1.2) {
          curPx = dest;
          done = true;
        }
      } else if (t < coastDuration) {
        curPx = coastX(t);
      } else {
        const rem = clamp(1 - (t - coastDuration) / landingDuration, 0, 1);
        curPx = dest - (dest - handoffPos) * rem * rem * rem;
        if (t >= coastDuration + landingDuration) {
          curPx = dest;
          done = true;
        }
      }

      focus = curPx / pitch;
      paint();

      if (!done) {
        animRaf = requestAnimationFrame(step);
      } else {
        animRaf = 0;
        focus = Math.round(dest / pitch);
        hapticArmed = false;
        paint();
        updateActiveReadout(true);
      }
    };
    animRaf = requestAnimationFrame(step);
  }

  function stepBy(delta) {
    if (items.length < 2) return;
    animateToSlot(Math.round(focus) + delta);
  }

  function handleTapOnSlot(slot) {
    if (!items.length) return;
    if (items.length === 1 || Math.abs(slot - focus) < 0.16) {
      const item = items[mod(slot, items.length)];
      const url = safeHref(item?.source_article_url);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } else {
      animateToSlot(slot);
    }
  }

  function initEvents() {
    const stage = document.getElementById('shelfStage');
    if (!stage || stage._shelfBound) return;
    stage._shelfBound = true;

    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || items.length === 0) return;
      finishEntrance();
      stopAnim();
      dragPointerId = e.pointerId;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartFocus = focus;
      dragLocked = null;
      dragMoved = false;
      velocitySamples = [{ x: e.clientX, t: performance.now() }];
      hapticArmed = true;
      lastDetentLane = Math.round(focus);
    });

    stage.addEventListener('pointermove', (e) => {
      if (dragPointerId !== e.pointerId || !geo) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      if (!dragLocked) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        dragLocked = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
        if (dragLocked === 'h') {
          stage.classList.add('dragging');
          try {
            stage.setPointerCapture(e.pointerId);
          } catch {}
        }
      }
      if (dragLocked !== 'h') return;

      dragMoved = true;
      if (items.length >= 2) {
        // Dragging finger right-to-left moves forward to higher index books
        focus = dragStartFocus - dx / geo.pitch;
        paint();
      }
      const now = performance.now();
      velocitySamples.push({ x: e.clientX, t: now });
      while (velocitySamples.length > 2 && now - velocitySamples[0].t > 95) {
        velocitySamples.shift();
      }
    });

    const endDrag = (e, cancelled) => {
      if (dragPointerId !== e.pointerId) return;
      const wasHorizontal = dragLocked === 'h';
      const wasMoved = dragMoved;
      dragPointerId = null;
      dragLocked = null;
      stage.classList.remove('dragging');
      try {
        if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      } catch {}

      if (!wasMoved && !cancelled) {
        hapticArmed = false;
        const vol = e.target && e.target.closest ? e.target.closest('.book-vol') : null;
        if (vol && vol.dataset.slot !== undefined) {
          handleTapOnSlot(Number(vol.dataset.slot));
        }
        return;
      }

      if (wasHorizontal && items.length >= 2) {
        let velPx = 0;
        if (velocitySamples.length >= 2) {
          const first = velocitySamples[0];
          const last = velocitySamples[velocitySamples.length - 1];
          const dt = (last.t - first.t) / 1000;
          if (dt > 0.005) {
            velPx = -(last.x - first.x) / dt;
          }
        }
        startPhysicsScroll(clamp(velPx, -2800, 2800));
      } else {
        hapticArmed = false;
      }
    };

    stage.addEventListener('pointerup', (e) => endDrag(e, false));
    stage.addEventListener('pointercancel', (e) => endDrag(e, true));

    // Horizontal trackpad / shift-wheel flick support on desktop
    let wheelTimer = null;
    stage.addEventListener(
      'wheel',
      (e) => {
        if (items.length < 2 || !geo) return;
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
        if (!delta) return;
        e.preventDefault();
        finishEntrance();
        stopAnim();
        focus += delta / (geo.pitch * 2.2);
        paint();
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => startPhysicsScroll(0), 110);
      },
      { passive: false }
    );

    stage.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBy(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepBy(1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleTapOnSlot(Math.round(focus));
      }
    });

    document.getElementById('shelfPrevBtn')?.addEventListener('click', () => stepBy(-1));
    document.getElementById('shelfNextBtn')?.addEventListener('click', () => stepBy(1));

    window.addEventListener(
      'resize',
      () => {
        if (state.viewMode === 'shelf' && items.length > 0) {
          measure();
          poolNodes.forEach((n) => (n._boundKey = ''));
          paint();
        }
      },
      { passive: true }
    );
  }

  function setItems(nextItems, { resetFocus = false } = {}) {
    initEvents();
    const prevActiveId = items.length ? items[mod(Math.round(focus), items.length)]?.id : null;
    items = Array.isArray(nextItems) ? nextItems : [];
    lastActiveModIdx = -1;
    poolNodes.forEach((n) => (n._boundKey = ''));

    if (!items.length) {
      stopAnim();
      ensurePool(0);
      updateActiveReadout(true);
      return;
    }

    measure();
    if (resetFocus || items.length < 2) {
      focus = 0;
      playEntrance();
    } else if (prevActiveId !== null) {
      const idx = items.findIndex((x) => x.id === prevActiveId);
      if (idx >= 0) {
        // Keep current book centered across background 60s refreshes
        focus = idx;
      } else {
        focus = 0;
      }
      entrance = 1;
      paint();
    } else {
      focus = 0;
      playEntrance();
    }
    updateActiveReadout(true);
  }

  function refreshActiveDetail() {
    if (state.viewMode === 'shelf' && items.length > 0) {
      poolNodes.forEach((n) => (n._boundKey = ''));
      paint();
      updateActiveReadout(true);
    }
  }

  return { setItems, stepBy, refreshActiveDetail };
})();

function updateViewModeUI() {
  const btn = document.getElementById('viewModeBtn');
  if (!btn) return;
  const isShelf = state.viewMode === 'shelf';
  btn.classList.toggle('is-shelf', isShelf);
  btn.innerHTML = isShelf ? ICONS.grid : ICONS.shelf;
  btn.title = isShelf ? '切换为传统卡片列表' : '切换为 3D 翻书架视图';
  btn.setAttribute('aria-label', btn.title);
}

function renderFilteredLocal({ resetShelfFocus = false } = {}) {
  const grid = document.getElementById('activitiesGrid');
  const shelfSec = document.getElementById('shelfSection');
  const items = sortItemsLocally(filterItemsLocally(state.allItems));
  updateViewModeUI();

  if (!items.length) {
    shelfSec.classList.add('hidden');
    grid.classList.remove('hidden');
    const hint = state.onlyEligible
      ? '暂无符合你所设身份与条件的活动（可点击顶部「我的身份」调整或关闭「只看我能报」）'
      : '暂无符合条件的活动';
    grid.innerHTML = `<div class="empty-box">${hint}</div>`;
    return;
  }

  if (state.viewMode === 'shelf') {
    grid.classList.add('hidden');
    shelfSec.classList.remove('hidden');
    ArchiveWaveShelf.setItems(items, { resetFocus: resetShelfFocus });
  } else {
    shelfSec.classList.add('hidden');
    grid.classList.remove('hidden');
    grid.innerHTML = items.map(renderCard).join('');
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
  renderFilteredLocal({ resetShelfFocus: true });
});

document.getElementById('sourceFilter').addEventListener('change', (e) => {
  state.source = e.target.value;
  renderFilteredLocal({ resetShelfFocus: true });
});

document.getElementById('audienceFilter').addEventListener('change', (e) => {
  state.audienceFilter = e.target.value;
  renderFilteredLocal({ resetShelfFocus: true });
});

document.getElementById('sortSelect').addEventListener('change', (e) => {
  state.sortBy = e.target.value || 'smart';
  renderFilteredLocal({ resetShelfFocus: true });
});

document.getElementById('onlyEligibleCheck').addEventListener('change', (e) => {
  const want = e.target.checked;
  if (want && !hasConfiguredProfile(state.profile)) {
    e.target.checked = false;
    openProfileModal();
    return;
  }
  state.onlyEligible = want;
  saveProfile();
  renderFilteredLocal({ resetShelfFocus: true });
});

document.getElementById('hideEndedCheck').addEventListener('change', (e) => {
  state.hideEnded = e.target.checked;
  renderFilteredLocal({ resetShelfFocus: true });
});

document.getElementById('viewModeBtn').addEventListener('click', () => {
  state.viewMode = state.viewMode === 'shelf' ? 'grid' : 'shelf';
  try {
    localStorage.setItem(VIEW_MODE_KEY, state.viewMode);
  } catch {}
  renderFilteredLocal({ resetShelfFocus: state.viewMode === 'shelf' });
});

/* ==================== 我的身份设置弹窗 ==================== */
function openProfileModal() {
  const p = state.profile;
  document.getElementById('profDegreeGrade').value = p.degreeGrade || '';
  document.getElementById('profCollege').value = p.college || '';
  document.getElementById('profCampus').value = p.campus || '';
  document.getElementById('profLeague').checked = Boolean(p.isLeague);
  document.getElementById('profParty').checked = Boolean(p.isParty);
  document.getElementById('profShowClub').checked = Boolean(p.showClubOnly);
  document.getElementById('profileModal').classList.remove('hidden');
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.add('hidden');
}

document.getElementById('profileBtn').addEventListener('click', openProfileModal);
document.getElementById('profClose').addEventListener('click', closeProfileModal);
document.getElementById('profileModal').addEventListener('click', (e) => {
  if (e.target.id === 'profileModal') closeProfileModal();
});

document.getElementById('profSaveBtn').addEventListener('click', () => {
  state.profile = {
    degreeGrade: document.getElementById('profDegreeGrade').value,
    college: document.getElementById('profCollege').value,
    campus: document.getElementById('profCampus').value,
    isLeague: document.getElementById('profLeague').checked,
    isParty: document.getElementById('profParty').checked,
    showClubOnly: document.getElementById('profShowClub').checked,
  };
  state.onlyEligible = hasConfiguredProfile(state.profile);
  saveProfile();
  updateProfileButtonUI();
  closeProfileModal();
  renderFilteredLocal({ resetShelfFocus: true });
});

document.getElementById('profResetBtn').addEventListener('click', () => {
  state.profile = { ...DEFAULT_PROFILE };
  state.onlyEligible = false;
  saveProfile();
  updateProfileButtonUI();
  closeProfileModal();
  renderFilteredLocal({ resetShelfFocus: true });
});

let searchTimer = null;
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = e.target.value.trim();
    renderFilteredLocal({ resetShelfFocus: true });
  }, 150);
});

function handleRemindClick(e) {
  const btn = e.target.closest('[data-remind-id]');
  if (!btn) return;
  const id = Number(btn.dataset.remindId);
  const item = state.allItems.find((a) => a.id === id);
  if (item) openRemindModal(item);
}

document.getElementById('activitiesGrid').addEventListener('click', handleRemindClick);
document.getElementById('shelfActiveCard').addEventListener('click', handleRemindClick);

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
loadProfile();
updateProfileButtonUI();
updateViewModeUI();
const initialCached = loadSnapshotFromCache();
if (initialCached) {
  state.meta = initialCached.meta;
  state.allItems = initialCached.allItems;
  state.lastSyncedAt = initialCached.cachedAt;
  applyMetaToDom();
  renderFilteredLocal({ resetShelfFocus: true });
}

refreshAll();

// 每秒更新倒计时胶囊 & 检查到点的静音振动提醒
setInterval(() => {
  for (const item of state.allItems) {
    const els = document.querySelectorAll(`[data-reg-pill="${item.id}"]`);
    if (!els.length) continue;
    const st = getRegistrationStatus(item);
    els.forEach((el) => {
      el.className = `reg-pill ${st.kind}`;
      el.textContent = st.label;
    });
  }
  checkDueReminders();
}, 1000);

setInterval(() => {
  if (state.meta) updateFreshnessUI();
}, 30 * 1000);
setInterval(refreshAll, 60 * 1000);
