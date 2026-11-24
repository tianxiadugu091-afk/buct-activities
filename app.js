const CACHE_KEY = 'wah_public_snapshot_v2';
const REMIND_KEY = 'wah_silent_reminders_v1';
const THEME_KEY = 'wah_theme';
const UI_STYLE_KEY = 'wah_ui_style_v1';
const LOCAL_ACCOUNTS_KEY = 'wah_student_accounts_v1';
const LOCAL_ACTIVE_USER_KEY = 'wah_student_active_v1';
const HUB_PUBLIC_URL = 'https://tianxiadugu091-afk.github.io/buct-activities/';
const IS_STATIC_HOST =
  window.location.protocol === 'file:' ||
  /\.(github\.io|pages\.dev|vercel\.app|netlify\.app|gitee\.io)$/i.test(window.location.hostname);

const BUCT_MODULES = [
  { key: 'moral', name: '德育思想', max: 180, color: '#ef4444', match: /德育|思想|党团|宏德/ },
  { key: 'academic', name: '学术科创', max: 120, color: '#3b82f6', match: /学术|科创|创新|创业|讲座|大创|竞赛/ },
  { key: 'sports', name: '体育身心', max: 100, color: '#f97316', match: /体育|身心|心理|体测|跑步|球/ },
  { key: 'aesthetic', name: '美育人文', max: 100, color: '#ec4899', match: /美育|人文|艺术|音乐|文艺|书画|演出|展览/ },
  { key: 'labor', name: '劳育实践', max: 100, color: '#10b981', match: /劳育|实践|志愿|公益|宿舍|劳动/ },
];
const BUCT_MODULE_MAP = Object.fromEntries(BUCT_MODULES.map((m) => [m.key, m]));
const BUCT_TOTAL_CAP = BUCT_MODULES.reduce((s, m) => s + m.max, 0);

const state = {
  tagId: '',
  source: '',
  audienceFilter: '',
  sortBy: 'smart',
  q: '',
  hideEnded: false,
  uiStyle: document.documentElement.getAttribute('data-ui') === 'pixel' ? 'pixel' : 'minimal',
  meta: null,
  allItems: [],
  isOfflineCache: false,
  isStaticMirror: IS_STATIC_HOST,
  lastSyncedAt: null,
  reminders: {},
  editingRemindItem: null,
  activeDetailId: null,
  posterItem: null,
  posterDataUrl: '',
  // Student Account & Credit Tracking
  studentBackendMode: !IS_STATIC_HOST, // automatically falls back to local mode if /api/student unavailable
  studentUser: null,
  studentRecords: [],
  authMode: 'register', // 'register' | 'login'
  creditTab: 'overview', // 'overview' | 'registered' | 'history'
  historyModuleFilter: '',
  pendingAttendActivity: null, // activity item or record being confirmed
  editingManualId: null,
  afterLoginAction: null, // callback executed seamlessly after user registers/logs in
  prevModScores: {},
};

/* ==================== 基础工具 & 动效引擎（Liquid Glass + Spring Physics） ==================== */
function haptic(ms = 10) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {}
}

let glassToastTimer = null;
function showGlassToast(message, tone = 'default', duration = 2200) {
  const el = document.getElementById('glassToast');
  if (!el || !message) return;
  clearTimeout(glassToastTimer);
  el.textContent = String(message);
  el.className = 'glass-toast' + (tone === 'success' || tone === 'warn' ? ` tone-${tone}` : '');
  // Force reflow so rapid consecutive toasts replay spring entry cleanly
  void el.offsetWidth;
  el.classList.add('show');
  glassToastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, duration);
}

function syncLiquidTrack(trackId, activeSelector, instant = false) {
  const track = document.getElementById(trackId);
  if (!track) return;
  const pill = track.querySelector(':scope > .liquid-pill-bg');
  const activeEl = track.querySelector(activeSelector);
  if (!pill || !activeEl) return;

  const w = activeEl.offsetWidth;
  const h = activeEl.offsetHeight;
  if (w <= 0 || h <= 0) return;

  const x = activeEl.offsetLeft;
  const y = activeEl.offsetTop;
  track.classList.add('has-indicator');

  const alreadyReady = pill.classList.contains('ready');
  if (instant || !alreadyReady) {
    pill.classList.add('no-anim');
    pill.style.top = `${y}px`;
    pill.style.height = `${h}px`;
    pill.style.bottom = 'auto';
    pill.style.width = `${w}px`;
    pill.style.setProperty('--lp-x', `${x}px`);
    pill.style.setProperty('--lp-sx', '1');
    pill.style.setProperty('--lp-sy', '1');
    pill.classList.add('ready');
    void pill.offsetWidth;
    requestAnimationFrame(() => pill.classList.remove('no-anim'));
  } else {
    const prevX = parseFloat(pill.dataset.lpX);
    if (Number.isFinite(prevX) && Math.abs(x - prevX) > 1) {
      const isPixel = state.uiStyle === 'pixel';
      pill.style.setProperty('--lp-sx', isPixel ? '1.04' : '1.08');
      pill.style.setProperty('--lp-sy', isPixel ? '0.96' : '0.93');
      clearTimeout(pill._stretchTimer);
      pill._stretchTimer = setTimeout(() => {
        pill.style.setProperty('--lp-sx', '1');
        pill.style.setProperty('--lp-sy', '1');
      }, 145);
    }
    pill.style.top = `${y}px`;
    pill.style.height = `${h}px`;
    pill.style.bottom = 'auto';
    pill.style.width = `${w}px`;
    pill.style.setProperty('--lp-x', `${x}px`);
  }
  pill.dataset.lpX = String(x);
}

function syncAllLiquidTracks(instant = false) {
  syncLiquidTrack('uiStyleSwitch', '.ui-sw-btn.active', instant);
  syncLiquidTrack('tagBar', '.chip.active', instant);
  syncLiquidTrack('authModeTabs', '.auth-tab.active', instant);
  syncLiquidTrack('creditTabs', '.credit-tab.active', instant);
}

function formatAnimatedScore(v, hasDecimal) {
  if (hasDecimal) return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
  return String(Math.round(v));
}

function animateNumber(el, targetVal, duration = 420) {
  if (!el) return;
  const target = Math.round((Number(targetVal) || 0) * 10) / 10;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prevRaw = el.dataset.numVal;
  const from = prevRaw !== undefined ? Number(prevRaw) : null;
  if (el._animRaf) {
    cancelAnimationFrame(el._animRaf);
    el._animRaf = null;
  }
  el.dataset.numVal = String(target);
  if (reduced || from === null || !Number.isFinite(from) || Math.abs(target - from) < 0.05) {
    el.textContent = String(target);
    return;
  }
  const hasDecimal = !Number.isInteger(target) || !Number.isInteger(from);
  const startTime = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 4);
    const cur = from + (target - from) * eased;
    el.textContent = t >= 1 ? String(target) : formatAnimatedScore(cur, hasDecimal);
    if (t < 1) {
      el._animRaf = requestAnimationFrame(step);
    } else {
      el._animRaf = null;
    }
  };
  el._animRaf = requestAnimationFrame(step);
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

function safeColor(hex, fallback = '#2e7def') {
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

function formatEventTimeDisplay(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return formatMdHm(s) || s;
  return s;
}

function toDatetimeLocalValue(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

function formatDurationCompact(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d >= 1) return `${d}天${h}h`;
  if (h >= 1) return `${h}h${pad2(m)}m`;
  if (m >= 1) return `${m}m${pad2(s)}s`;
  return `${s}s`;
}

function formatAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMin = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}小时前`;
  return `${Math.floor(diffMin / 1440)}天前`;
}

function avatarStyle(name) {
  const palettes = [
    'linear-gradient(135deg,#4f46e5,#0ea5e9)',
    'linear-gradient(135deg,#059669,#10b981)',
    'linear-gradient(135deg,#d97706,#f59e0b)',
    'linear-gradient(135deg,#e11d48,#f43f5e)',
    'linear-gradient(135deg,#7c3aed,#a855f7)',
    'linear-gradient(135deg,#0284c7,#38bdf8)',
  ];
  let hash = 0;
  for (const ch of String(name || '活')) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return `background:${palettes[hash % palettes.length]}`;
}

function avatarChar(name) {
  const s = String(name || '活').replace(/^北化|^北京化工大学/, '').trim();
  return (s || String(name || '活')).charAt(0);
}

/* ==================== 主题 & 风格切换 ==================== */
const SUN_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const MOON_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';

function syncThemeToggleIcon() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.innerHTML = dark ? SUN_SVG : MOON_SVG;
    btn.title = dark ? '切换亮色模式' : '切换暗色模式';
  }
  const fsBtn = document.getElementById('fsThemeBtn');
  if (fsBtn) {
    fsBtn.textContent = dark ? '☀ 切换亮色主题' : '🌙 切换暗色主题';
  }
}

function toggleDarkLightTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {}
  syncThemeToggleIcon();
  requestAnimationFrame(() => syncAllLiquidTracks(true));
  showGlassToast(next === 'dark' ? '🌙 已切换暗色主题' : '☀ 已切换亮色主题');
  haptic(10);
}

function updateUiStyleUI(instant = false) {
  const isPixel = state.uiStyle === 'pixel';
  document.documentElement.setAttribute('data-ui', state.uiStyle);
  document.querySelectorAll('#uiStyleSwitch [data-ui-choice]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.uiChoice === state.uiStyle);
  });
  const mobBtn = document.getElementById('uiStyleMobileBtn');
  if (mobBtn) {
    mobBtn.textContent = isPixel ? '☁ 简约' : '⚔ 悬赏';
    mobBtn.title = isPixel ? '切换到简约版' : '切换到像素悬赏版';
  }
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.placeholder = isPixel ? '搜悬赏任务 / 公会…' : '搜活动 / 公众号…';
  }
  const freshTitle = document.getElementById('freshSectionTitle');
  if (freshTitle) freshTitle.textContent = isPixel ? '最新贴榜' : '刚刚更新';
  const allTitle = document.getElementById('allSectionTitle');
  if (allTitle) allTitle.textContent = isPixel ? '全部悬赏委托' : '全部活动';
  const csTitle = document.getElementById('csTitle');
  if (csTitle) csTitle.textContent = isPixel ? '⚔ 冒险者二课档案' : '我的二课成绩';
  const posterTitle = document.getElementById('posterTitle');
  if (posterTitle) posterTitle.textContent = isPixel ? '像素悬赏通缉令' : '活动分享卡片图';
  requestAnimationFrame(() => {
    syncLiquidTrack('uiStyleSwitch', '.ui-sw-btn.active', instant);
    syncLiquidTrack('tagBar', '.chip.active', true);
    syncLiquidTrack('authModeTabs', '.auth-tab.active', true);
    syncLiquidTrack('creditTabs', '.credit-tab.active', true);
  });
}

function setUiStyle(nextStyle) {
  const normalized = nextStyle === 'pixel' ? 'pixel' : 'minimal';
  const changed = state.uiStyle !== normalized;
  state.uiStyle = normalized;
  try {
    localStorage.setItem(UI_STYLE_KEY, normalized);
  } catch {}
  updateUiStyleUI(false);
  updateStudentUI();
  renderFilteredLocal({ animate: true });
  if (changed) {
    showGlassToast(normalized === 'pixel' ? '⚔ 已切换至像素悬赏模式' : '☁ 已切换至简约液态玻璃模式');
  }
  haptic(12);
}

/* ==================== 拼手速识别 + 报名倒计时 + 过 5 分钟降权 ==================== */
function parseIsoMs(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * 判断活动是否属于「不拼手速」的长期征集/投稿/打卡/常规赛事
 * 拼手速（抢票/限额/讲座/先到先得/短窗口）在开抢 5 分钟后自动降权并标「余量大概率不足」
 */
function isNonRushActivity(item) {
  const startMs = parseIsoMs(item.reg_start_at);
  if (!startMs) return true;
  const endMs = parseIsoMs(item.reg_end_at);
  const text = `${item.title || ''} ${item.reg_time_text || ''} ${item.deadline || ''} ${item.audience_text || ''}`;

  const rushRe = /抢票|抢名额|限\s*\d+\s*人|先到先得|名额有限|名额\s*\d+|手慢无|秒杀|限时抢|讲座|沙龙|分享会|观影|演出|音乐会|门票|内场|问卷开启/;
  if (rushRe.test(text)) return false;

  const nonRushRe = /征集|征文|投稿|作品提交|作品征集|征稿|打卡|长期|评选|评比|奖学金|短视频大赛|摄影大赛|设计大赛|征途|挑战赛|演讲比赛|辩论赛|知识竞赛|编程设计/;
  if (nonRushRe.test(text)) return true;

  if (endMs && endMs - startMs >= 48 * 3600 * 1000) return true;
  return false;
}

function getRegistrationStatus(item) {
  const now = Date.now();
  const startMs = parseIsoMs(item.reg_start_at);
  const endMs = parseIsoMs(item.reg_end_at);
  const eventEndMs = parseIsoMs(item.event_end_at);
  const nonRush = isNonRushActivity(item);

  if (endMs && now > endMs) {
    return { kind: 'ended', label: '已截止', targetMs: endMs, ended: true };
  }
  if (!endMs && eventEndMs && now > eventEndMs) {
    return { kind: 'ended', label: '已结束', targetMs: eventEndMs, ended: true };
  }
  if (startMs && now < startMs) {
    return {
      kind: 'upcoming',
      label: `距开抢 ${formatDurationCompact(startMs - now)}`,
      targetMs: startMs,
      ended: false,
    };
  }
  if (startMs && now >= startMs) {
    const elapsedMs = now - startMs;
    if (!nonRush) {
      if (elapsedMs < 5 * 60 * 1000) {
        const leftMin = Math.max(1, Math.ceil((5 * 60 * 1000 - elapsedMs) / 60000));
        return {
          kind: 'golden',
          label: `🔥 刚开抢·余${leftMin}m`,
          targetMs: endMs || startMs + 5 * 60 * 1000,
          ended: false,
        };
      }
      return {
        kind: 'low_stock',
        label: '余量大概率不足',
        targetMs: endMs || startMs,
        ended: false,
      };
    }
    if (endMs && endMs - now <= 6 * 3600 * 1000) {
      return {
        kind: 'urgent',
        label: `剩 ${formatDurationCompact(endMs - now)}`,
        targetMs: endMs,
        ended: false,
      };
    }
    return { kind: 'open', label: '报名中', targetMs: endMs || null, ended: false };
  }
  if (endMs && now <= endMs) {
    const left = endMs - now;
    if (left <= 6 * 3600 * 1000) {
      return { kind: 'urgent', label: `剩 ${formatDurationCompact(left)}`, targetMs: endMs, ended: false };
    }
    return { kind: 'open', label: '报名中', targetMs: endMs, ended: false };
  }
  return { kind: 'unknown', label: '详见推文', targetMs: null, ended: false };
}

/* ==================== 卡片信息极致精炼工具 ==================== */
function getAudienceObj(item) {
  const a = item.audience_json;
  if (a && typeof a === 'object') return a;
  return { scope: 'unknown', colleges: [], grades: [], degrees: [], campuses: [], politics: [], clubOnly: false };
}

function matchesAudienceQuickFilter(item, filterKey) {
  if (!filterKey) return true;
  const aud = getAudienceObj(item);
  const text = String(item.audience_text || '');
  if (filterKey === 'all') return aud.scope === 'all' && !aud.clubOnly;
  if (filterKey === 'club') return Boolean(aud.clubOnly) || /社团内部|内部成员/.test(text);
  if (filterKey === 'college') return (aud.colleges || []).length > 0 || /学院/.test(text);
  if (filterKey === 'freshman') {
    if (aud.clubOnly) return false;
    if (aud.scope === 'all') return true;
    return (aud.grades || []).includes('大一') || /大一|2026级|2025级|新生/.test(text);
  }
  if (filterKey === 'undergrad') {
    if (aud.clubOnly) return false;
    if (aud.scope === 'all') return true;
    const degs = aud.degrees || [];
    if (degs.length && !degs.includes('本科生')) return false;
    return degs.includes('本科生') || (aud.grades || []).length > 0 || /本科/.test(text);
  }
  if (filterKey === 'grad') {
    if (aud.clubOnly) return false;
    if (aud.scope === 'all') return true;
    return (aud.degrees || []).includes('研究生') || /研究生|硕士|博士/.test(text);
  }
  return true;
}

function compactAudienceLabel(item) {
  const aud = getAudienceObj(item);
  const raw = String(item.audience_text || '').trim();
  if (aud.clubOnly || /社团内部|内部成员/.test(raw)) return { text: '社团内部', cls: 'aud-club' };
  const capMatch = raw.match(/限\s*(\d+\s*人)/);
  if (aud.scope === 'all' || /^全校/.test(raw)) {
    return { text: capMatch ? `全校·限${capMatch[1]}` : '全校可报', cls: 'aud-all' };
  }
  if ((aud.colleges || []).length) {
    const c = aud.colleges[0].replace(/学院$/, '院');
    return { text: `限${c}`, cls: 'aud-restricted' };
  }
  if ((aud.grades || []).length) {
    return { text: `限${aud.grades.slice(0, 2).join('/')}`, cls: 'aud-restricted' };
  }
  if ((aud.degrees || []).length) {
    return { text: `限${aud.degrees[0]}`, cls: 'aud-restricted' };
  }
  if (capMatch) return { text: `限${capMatch[1]}`, cls: 'aud-restricted' };
  const clean = raw.replace(/[（(][^）)]*[）)]/g, '').trim();
  if (!clean || /详见推文/.test(clean)) return { text: '人群见推文', cls: '' };
  return { text: clean.length > 7 ? `${clean.slice(0, 6)}…` : clean, cls: 'aud-restricted' };
}

function extractScoreCandidates(item) {
  const raw = String(item.credit_hint || '');
  const nums = [];
  const re = /(\d+(?:\.\d+)?)\s*分/g;
  let m;
  while ((m = re.exec(raw))) {
    const val = Number(m[1]);
    if (Number.isFinite(val) && val > 0 && val <= 60 && !nums.includes(val)) {
      nums.push(val);
    }
  }
  nums.sort((a, b) => a - b);
  return nums;
}

function compactCreditLabel(item, isUncertain) {
  if (isUncertain) return '分值待定';
  const scores = extractScoreCandidates(item);
  if (scores.length === 1) return `+${scores[0]}分`;
  if (scores.length >= 2) return `+${scores[0]}~${scores[scores.length - 1]}分`;
  const raw = String(item.credit_hint || '');
  const hrMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:志愿)?时长/);
  if (hrMatch) return `+${hrMatch[1]}h时长`;
  return '';
}

function compactTimeBrief(item, regSt) {
  if (regSt.kind === 'upcoming' && item.reg_start_at) {
    return { text: `报名 ${formatMdHm(item.reg_start_at)}开抢`, hi: true };
  }
  if (regSt.kind === 'golden' && item.reg_end_at) {
    return { text: `报名 ${formatMdHm(item.reg_end_at)}止`, hi: true };
  }
  if (regSt.kind === 'golden' && item.reg_start_at) {
    return { text: `报名 ${formatMdHm(item.reg_start_at)}起`, hi: true };
  }
  if (regSt.kind === 'low_stock' && item.reg_start_at) {
    return { text: `报名 ${formatMdHm(item.reg_start_at)}已开`, hi: false };
  }
  if (item.reg_end_at) {
    return { text: `报名 ${formatMdHm(item.reg_end_at)}止`, hi: regSt.kind === 'urgent' };
  }
  if (item.reg_start_at) {
    return { text: `报名 ${formatMdHm(item.reg_start_at)}起`, hi: false };
  }
  const rawReg = String(item.reg_time_text || item.deadline || '').trim();
  if (
    rawReg &&
    !/未写明|未说明|未提及|详见推文/.test(rawReg) &&
    /[\d]|今天|明天|今晚|明早|周[一二三四五六日天]|即日起|长期/.test(rawReg)
  ) {
    const cleaned = rawReg.replace(/^报名(?:时间|日期)?[：:\s]*/, '').trim();
    const short = cleaned.length > 13 ? `${cleaned.slice(0, 12)}…` : cleaned;
    return { text: `报名 ${short}`, hi: false };
  }
  return { text: '报名 详见推文', hi: false };
}

function inferModuleKeyFromItem(item) {
  const combined = `${(item.tags || []).map((t) => t.name).join(' ')} ${item.credit_hint || ''} ${item.title || ''}`;
  for (const mod of BUCT_MODULES) {
    if (mod.match.test(combined)) return mod.key;
  }
  return 'moral';
}

function getQuestMeta(item, regSt, isUncertain) {
  if (regSt.ended) return { code: 'END', label: '已归档', cls: 'rank-end' };
  if (regSt.kind === 'golden' || regSt.kind === 'urgent') return { code: 'S', label: 'S 急赏', cls: 'rank-s' };
  if (regSt.kind === 'low_stock') return { code: 'C', label: '捡漏', cls: 'rank-end' };
  if (!isUncertain && extractScoreCandidates(item).length > 0) return { code: 'A', label: 'A 高赏', cls: 'rank-a' };
  return { code: 'B', label: 'B 委托', cls: 'rank-b' };
}

/* ==================== 个人二课账号 & 成绩存储引擎（SQLite + 本地双端兼容 + 同步口令） ==================== */
function simplePassHash(username, password) {
  const str = `${String(username).toLowerCase()}::buct2k::${String(password)}`;
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function readLocalAccountsDb() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS_KEY) || '{}');
    if (raw && typeof raw === 'object' && raw.users) return raw;
  } catch {}
  return { users: {} };
}

function writeLocalAccountsDb(dbObj) {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(dbObj));
  } catch {}
}

function getLocalActiveUsername() {
  try {
    return localStorage.getItem(LOCAL_ACTIVE_USER_KEY) || '';
  } catch {
    return '';
  }
}

function setLocalActiveUsername(uname) {
  try {
    if (uname) localStorage.setItem(LOCAL_ACTIVE_USER_KEY, uname);
    else localStorage.removeItem(LOCAL_ACTIVE_USER_KEY);
  } catch {}
}

async function studentApiRequest(path, method = 'GET', body = null) {
  const opts = {
    method,
    credentials: 'same-origin',
    headers: {},
  };
  if (body !== null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function initStudentSession() {
  if (!IS_STATIC_HOST) {
    try {
      const data = await studentApiRequest('/api/student/me');
      state.studentBackendMode = true;
      state.studentUser = data.user || null;
      state.studentRecords = Array.isArray(data.records) ? data.records : [];
      updateStudentUI();
      return;
    } catch {
      state.studentBackendMode = false;
    }
  }
  // Static host / offline local-account fallback
  const db = readLocalAccountsDb();
  const activeKey = getLocalActiveUsername();
  if (activeKey && db.users[activeKey]) {
    const u = db.users[activeKey];
    state.studentUser = { username: u.username, display_name: u.display_name };
    state.studentRecords = Array.isArray(u.records) ? u.records : [];
  } else {
    state.studentUser = null;
    state.studentRecords = [];
  }
  updateStudentUI();
}

async function studentRegister(username, displayName, password) {
  const uname = String(username || '').trim();
  const dname = String(displayName || uname).trim() || uname;
  if (state.studentBackendMode) {
    const data = await studentApiRequest('/api/student/register', 'POST', {
      username: uname,
      displayName: dname,
      password,
    });
    state.studentUser = data.user;
    state.studentRecords = data.records || [];
    updateStudentUI();
    return;
  }
  const db = readLocalAccountsDb();
  const key = uname.toLowerCase();
  if (db.users[key]) throw new Error('该账号已存在，请切换到「已有账号登录」');
  db.users[key] = {
    username: uname,
    display_name: dname,
    passHash: simplePassHash(uname, password),
    records: [],
    createdAt: new Date().toISOString(),
  };
  writeLocalAccountsDb(db);
  setLocalActiveUsername(key);
  state.studentUser = { username: uname, display_name: dname };
  state.studentRecords = [];
  updateStudentUI();
}

async function studentLogin(username, password) {
  const uname = String(username || '').trim();
  if (state.studentBackendMode) {
    const data = await studentApiRequest('/api/student/login', 'POST', { username: uname, password });
    state.studentUser = data.user;
    state.studentRecords = data.records || [];
    updateStudentUI();
    return;
  }
  const db = readLocalAccountsDb();
  const key = uname.toLowerCase();
  const u = db.users[key];
  if (!u || u.passHash !== simplePassHash(uname, password)) {
    throw new Error('账号或密码错误（若是新设备，可用下方同步口令恢复）');
  }
  setLocalActiveUsername(key);
  state.studentUser = { username: u.username, display_name: u.display_name };
  state.studentRecords = Array.isArray(u.records) ? u.records : [];
  updateStudentUI();
}

async function studentLogout() {
  if (state.studentBackendMode) {
    await studentApiRequest('/api/student/logout', 'POST').catch(() => {});
  }
  setLocalActiveUsername('');
  state.studentUser = null;
  state.studentRecords = [];
  state.prevModScores = {};
  const totalEl = document.getElementById('cdTotalValid');
  if (totalEl) delete totalEl.dataset.numVal;
  updateStudentUI();
  renderFilteredLocal();
}

function persistLocalStudentRecords() {
  if (state.studentBackendMode || !state.studentUser) return;
  const db = readLocalAccountsDb();
  const key = state.studentUser.username.toLowerCase();
  if (!db.users[key]) return;
  db.users[key].records = state.studentRecords;
  writeLocalAccountsDb(db);
}

async function saveActivityRecord({ activityId, title, moduleKey, score = 0, status = 'registered', eventDate = '', note = '' }) {
  if (state.studentBackendMode) {
    const data = await studentApiRequest('/api/student/records/activity', 'POST', {
      activityId,
      title,
      moduleKey,
      score,
      status,
      eventDate,
      note,
    });
    state.studentRecords = data.records || [];
  } else {
    const aid = Number(activityId);
    const now = new Date().toISOString();
    if (status === 'none') {
      state.studentRecords = state.studentRecords.filter((r) => Number(r.activity_id) !== aid);
    } else {
      const idx = state.studentRecords.findIndex((r) => Number(r.activity_id) === aid);
      const rec = {
        id: idx >= 0 ? state.studentRecords[idx].id : Date.now() + Math.floor(Math.random() * 1000),
        activity_id: aid,
        title: String(title || '').slice(0, 140),
        module_key: BUCT_MODULE_MAP[moduleKey] ? moduleKey : 'moral',
        score: status === 'attended' ? Math.max(0, Number(score) || 0) : 0,
        status: status === 'attended' ? 'attended' : 'registered',
        event_date: eventDate || now.slice(0, 10),
        note: note || '',
        created_at: idx >= 0 ? state.studentRecords[idx].created_at : now,
        updated_at: now,
      };
      if (idx >= 0) state.studentRecords[idx] = rec;
      else state.studentRecords.unshift(rec);
    }
    persistLocalStudentRecords();
  }
  updateStudentUI();
  renderFilteredLocal();
}

async function saveManualRecord({ id = null, title, moduleKey, score, eventDate, note }) {
  if (state.studentBackendMode) {
    const data = id
      ? await studentApiRequest(`/api/student/records/${id}`, 'PUT', {
          title,
          moduleKey,
          score,
          status: 'attended',
          eventDate,
          note,
        })
      : await studentApiRequest('/api/student/records/manual', 'POST', {
          title,
          moduleKey,
          score,
          eventDate,
          note,
        });
    state.studentRecords = data.records || [];
  } else {
    const now = new Date().toISOString();
    if (id) {
      const idx = state.studentRecords.findIndex((r) => Number(r.id) === Number(id));
      if (idx >= 0) {
        state.studentRecords[idx] = {
          ...state.studentRecords[idx],
          title,
          module_key: BUCT_MODULE_MAP[moduleKey] ? moduleKey : 'moral',
          score: Math.max(0, Number(score) || 0),
          status: 'attended',
          event_date: eventDate || now.slice(0, 10),
          note: note || '',
          updated_at: now,
        };
      }
    } else {
      state.studentRecords.unshift({
        id: Date.now() + Math.floor(Math.random() * 1000),
        activity_id: null,
        title,
        module_key: BUCT_MODULE_MAP[moduleKey] ? moduleKey : 'moral',
        score: Math.max(0, Number(score) || 0),
        status: 'attended',
        event_date: eventDate || now.slice(0, 10),
        note: note || '',
        created_at: now,
        updated_at: now,
      });
    }
    persistLocalStudentRecords();
  }
  updateStudentUI();
  renderFilteredLocal();
}

async function removeStudentRecord(recordId) {
  if (state.studentBackendMode) {
    const data = await studentApiRequest(`/api/student/records/${recordId}`, 'DELETE');
    state.studentRecords = data.records || [];
  } else {
    state.studentRecords = state.studentRecords.filter((r) => Number(r.id) !== Number(recordId));
    persistLocalStudentRecords();
  }
  updateStudentUI();
  renderFilteredLocal();
}

function getRecordForActivity(activityId) {
  return state.studentRecords.find((r) => Number(r.activity_id) === Number(activityId)) || null;
}

function computeCreditSummary() {
  const byMod = {};
  for (const m of BUCT_MODULES) {
    byMod[m.key] = { ...m, raw: 0, capped: 0, gap: m.max, full: false, count: 0 };
  }
  let attendedCount = 0;
  let registeredCount = 0;
  for (const r of state.studentRecords) {
    if (r.status === 'attended') {
      attendedCount += 1;
      const key = BUCT_MODULE_MAP[r.module_key] ? r.module_key : 'moral';
      byMod[key].raw += Math.max(0, Number(r.score) || 0);
      byMod[key].count += 1;
    } else if (r.status === 'registered') {
      registeredCount += 1;
    }
  }
  let totalValid = 0;
  let totalRaw = 0;
  for (const m of BUCT_MODULES) {
    const s = byMod[m.key];
    s.raw = Math.round(s.raw * 10) / 10;
    s.capped = Math.min(s.raw, m.max);
    s.gap = Math.max(0, Math.round((m.max - s.capped) * 10) / 10);
    s.full = s.capped >= m.max;
    totalValid += s.capped;
    totalRaw += s.raw;
  }
  totalValid = Math.round(totalValid * 10) / 10;
  totalRaw = Math.round(totalRaw * 10) / 10;

  // Pending settlement: registered activities whose reg_end_at or event_end_at or reg_start_at+2h has passed
  const now = Date.now();
  const pendingSettle = state.studentRecords.filter((r) => {
    if (r.status !== 'registered') return false;
    const act = state.allItems.find((a) => Number(a.id) === Number(r.activity_id));
    if (!act) return true;
    const evEnd = parseIsoMs(act.event_end_at);
    const regEnd = parseIsoMs(act.reg_end_at);
    const regStart = parseIsoMs(act.reg_start_at);
    if (evEnd && now > evEnd) return true;
    if (regEnd && now > regEnd) return true;
    if (regStart && now > regStart + 2 * 3600 * 1000) return true;
    return false;
  });

  const level = Math.min(10, Math.floor(totalValid / 60) + 1);
  const rankNames = ['见习新生', '校园游侠', '二课猎手', '进阶学者', '满绩勇者', '北化传奇'];
  const rankTitle = rankNames[Math.min(level - 1, rankNames.length - 1)];

  return {
    byMod,
    totalValid,
    totalRaw,
    attendedCount,
    registeredCount,
    pendingSettle,
    level,
    rankTitle,
  };
}

function requireStudentAuth(callback) {
  if (state.studentUser) {
    callback();
    return;
  }
  state.afterLoginAction = callback;
  openSheet('creditSheet');
  haptic(8);
}

/* ==================== 二课统计 UI 渲染 ==================== */
function updateStudentUI() {
  const summary = computeCreditSummary();
  const isPixel = state.uiStyle === 'pixel';
  const accBtn = document.getElementById('accountBtn');
  const accTxt = document.getElementById('accountBtnText');
  const accDot = document.getElementById('accountPendingDot');

  if (accBtn && accTxt) {
    if (state.studentUser) {
      accBtn.classList.add('logged-in');
      const shortName = String(state.studentUser.display_name || state.studentUser.username).slice(0, 6);
      accTxt.textContent = `${shortName} · ${summary.totalValid}分`;
    } else {
      accBtn.classList.remove('logged-in');
      accTxt.textContent = isPixel ? '⚔ 档案' : '我的二课';
    }
  }
  if (accDot) {
    accDot.classList.toggle('hidden', !state.studentUser || summary.pendingSettle.length === 0);
  }

  // Update 44px slim pixel adventurer bar
  const qsbRank = document.getElementById('qsbRank');
  const qsbScore = document.getElementById('qsbScore');
  const qsbCells = document.getElementById('qsbCells');
  if (qsbRank) {
    qsbRank.textContent = state.studentUser
      ? `LV.${summary.level} ${summary.rankTitle}`
      : 'LV.1 冒险者未登录';
  }
  if (qsbScore) {
    qsbScore.textContent = state.studentUser
      ? `二课 ${summary.totalValid} / ${BUCT_TOTAL_CAP}`
      : '点此建档记分';
  }
  if (qsbCells) {
    const filled = Math.min(10, Math.round((summary.totalValid / BUCT_TOTAL_CAP) * 10));
    qsbCells.innerHTML = Array.from({ length: 10 }, (_, i) =>
      `<span class="qsb-cell ${i < filled ? 'filled' : ''}"></span>`
    ).join('');
  }

  renderCreditSheetContent(summary);
}

function renderCreditSheetContent(summary) {
  const authView = document.getElementById('creditAuthView');
  const dashView = document.getElementById('creditDashView');
  if (!authView || !dashView) return;

  if (!state.studentUser) {
    authView.classList.remove('hidden');
    dashView.classList.add('hidden');
    const isReg = state.authMode === 'register';
    document.querySelectorAll('#authModeTabs .auth-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.authMode === state.authMode);
    });
    document.getElementById('saDisplayWrap').classList.toggle('hidden', !isReg);
    document.getElementById('saSubmitBtn').textContent = isReg
      ? state.uiStyle === 'pixel'
        ? '⚔ 创建冒险者档案'
        : '创建账号并开始记录'
      : '登录查看二课成绩';
    requestAnimationFrame(() => syncLiquidTrack('authModeTabs', '.auth-tab.active'));
    return;
  }

  authView.classList.add('hidden');
  dashView.classList.remove('hidden');

  const dname = state.studentUser.display_name || state.studentUser.username;
  document.getElementById('cdAvatar').textContent = dname.charAt(0).toUpperCase();
  document.getElementById('cdDisplayName').textContent = dname;
  document.getElementById('cdRankPill').textContent = `LV.${summary.level} ${summary.rankTitle}`;
  document.getElementById('cdUsernameSub').textContent = `@${state.studentUser.username} · ${
    state.studentBackendMode ? '本地数据库实时保存' : '本机浏览器保存（支持同步口令）'
  }`;
  animateNumber(document.getElementById('cdTotalValid'), summary.totalValid, 440);
  document.getElementById('cdTotalRawMeta').textContent = `已参加 ${summary.attendedCount} 项 · 已报名待参加 ${
    summary.registeredCount
  } 项${summary.totalRaw > summary.totalValid ? `（含溢出 ${Math.round((summary.totalRaw - summary.totalValid) * 10) / 10} 分）` : ''}`;

  // Pending settlement box
  const psBox = document.getElementById('pendingSettleBox');
  if (summary.pendingSettle.length > 0) {
    psBox.classList.remove('hidden');
    psBox.innerHTML = `
      <div class="ps-head">⏳ 有 ${summary.pendingSettle.length} 个已报活动可结算二课分</div>
      ${summary.pendingSettle
        .slice(0, 3)
        .map(
          (r) => `
        <div class="ps-row">
          <span class="ps-title">${escapeHtml(r.title)}</span>
          <button type="button" class="mini-pill-btn primary" data-settle-rec-id="${r.id}">我已参加 ✓</button>
        </div>`
        )
        .join('')}
    `;
  } else {
    psBox.classList.add('hidden');
    psBox.innerHTML = '';
  }

  // Tabs
  document.getElementById('ctabRegCount').textContent = String(summary.registeredCount);
  document.getElementById('ctabHistCount').textContent = String(summary.attendedCount);
  document.querySelectorAll('#creditTabs .credit-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.ctab === state.creditTab);
  });
  document.getElementById('ctabOverview').classList.toggle('hidden', state.creditTab !== 'overview');
  document.getElementById('ctabRegistered').classList.toggle('hidden', state.creditTab !== 'registered');
  document.getElementById('ctabHistory').classList.toggle('hidden', state.creditTab !== 'history');
  requestAnimationFrame(() => syncLiquidTrack('creditTabs', '.credit-tab.active'));

  // Tab 1: 5-Module Progress Bars (AnimatedCount + Spring Bar + Pixel 10-Cell Segmented HP Bar)
  const modList = document.getElementById('moduleBarsList');
  const prevScores = state.prevModScores || {};
  const nextPrevScores = {};
  const fillTransitions = [];
  modList.innerHTML = BUCT_MODULES.map((m) => {
    const s = summary.byMod[m.key];
    const pct = Math.min(100, Math.round((s.capped / m.max) * 100));
    const prevVal = prevScores[m.key];
    const startPct = prevVal !== undefined ? Math.min(100, Math.round((prevVal / m.max) * 100)) : pct;
    if (startPct !== pct) fillTransitions.push({ key: m.key, pct });
    nextPrevScores[m.key] = s.capped;
    const filledCells = Math.min(10, Math.round((s.capped / m.max) * 10));
    const gapHtml = s.full
      ? '<span class="mod-gap full">✓ 已修满</span>'
      : `<span class="mod-gap">还差 ${s.gap} 分</span>`;
    return `
      <div class="mod-row" style="--mc:${m.color}">
        <div class="mod-row-top">
          <span class="mod-name"><span class="mod-dot"></span>${m.name}</span>
          <span class="mod-nums"><span class="mod-num-val" data-mod-key="${m.key}">${prevVal !== undefined ? prevVal : s.capped}</span> / ${m.max}${gapHtml}</span>
        </div>
        <div class="mod-track"><div class="mod-fill" data-mod-fill="${m.key}" style="width:${startPct}%"></div></div>
        <div class="mod-px-cells">
          ${Array.from({ length: 10 }, (_, i) => `<span class="mod-px-cell ${i < filledCells ? 'filled' : ''}"></span>`).join('')}
        </div>
      </div>
    `;
  }).join('');

  modList.querySelectorAll('.mod-num-val[data-mod-key]').forEach((numEl) => {
    const k = numEl.dataset.modKey;
    if (prevScores[k] !== undefined) numEl.dataset.numVal = String(prevScores[k]);
    animateNumber(numEl, summary.byMod[k]?.capped ?? 0, 380);
  });
  if (fillTransitions.length) {
    requestAnimationFrame(() => {
      for (const ft of fillTransitions) {
        const bar = modList.querySelector(`.mod-fill[data-mod-fill="${ft.key}"]`);
        if (bar) bar.style.width = `${ft.pct}%`;
      }
    });
  }
  state.prevModScores = nextPrevScores;

  // Tab 2: Registered activities list (with explicit compact registration date)
  const regRecords = state.studentRecords.filter((r) => r.status === 'registered');
  const regListEl = document.getElementById('registeredList');
  if (!regRecords.length) {
    regListEl.innerHTML = '<div class="empty-box" style="padding:26px">暂无待参加活动，点开任意活动卡片即可标记「报名成功」</div>';
  } else {
    regListEl.innerHTML = regRecords
      .map((r) => {
        const mod = BUCT_MODULE_MAP[r.module_key] || BUCT_MODULES[0];
        const linkedAct = state.allItems.find((a) => Number(a.id) === Number(r.activity_id));
        const regBrief = linkedAct
          ? compactTimeBrief(linkedAct, getRegistrationStatus(linkedAct)).text
          : r.event_date
          ? `日期 ${r.event_date}`
          : '已报名';
        return `
          <div class="rec-item">
            <div class="rec-main">
              <div class="rec-title">${escapeHtml(r.title)}</div>
              <div class="rec-meta">
                <span style="color:${mod.color};font-weight:700">${mod.name}</span>
                <span>${escapeHtml(regBrief)}</span>
                <span>待确认参加</span>
              </div>
            </div>
            <div class="rec-side">
              <button type="button" class="mini-pill-btn primary" data-settle-rec-id="${r.id}">我已参加</button>
              <button type="button" class="rec-del-btn" data-del-rec-id="${r.id}" title="取消报名">✕</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Tab 3: Attended & Manual Credit History
  const histRecords = state.studentRecords.filter(
    (r) => r.status === 'attended' && (!state.historyModuleFilter || r.module_key === state.historyModuleFilter)
  );
  const histEl = document.getElementById('historyList');
  if (!histRecords.length) {
    histEl.innerHTML = '<div class="empty-box" style="padding:26px">暂无成绩记录，参加活动后点击「我已参加」或点右上角手动补录</div>';
  } else {
    histEl.innerHTML = histRecords
      .map((r) => {
        const mod = BUCT_MODULE_MAP[r.module_key] || BUCT_MODULES[0];
        return `
          <div class="rec-item">
            <div class="rec-main">
              <div class="rec-title">${escapeHtml(r.title)}</div>
              <div class="rec-meta">
                <span style="color:${mod.color};font-weight:700">${mod.name}</span>
                <span>${escapeHtml(r.event_date || (r.updated_at || '').slice(0, 10))}</span>
                ${r.note ? `<span>${escapeHtml(r.note)}</span>` : ''}
              </div>
            </div>
            <div class="rec-side">
              <span class="rec-score-pill">+${r.score}分</span>
              <button type="button" class="rec-del-btn" data-edit-rec-id="${r.id}" title="修改">✎</button>
              <button type="button" class="rec-del-btn" data-del-rec-id="${r.id}" title="删除">✕</button>
            </div>
          </div>
        `;
      })
      .join('');
  }
}

/* ==================== 记分确认弹窗 / 手动补录 / 同步口令 ==================== */
function openAttendModalForActivity(item, existingRec = null) {
  requireStudentAuth(() => {
    const inferredMod = existingRec?.module_key || inferModuleKeyFromItem(item);
    const candidates = extractScoreCandidates(item);
    const defaultScore =
      existingRec && existingRec.status === 'attended' && existingRec.score > 0
        ? existingRec.score
        : candidates[0] || 10;

    state.pendingAttendActivity = { item, existingRec };
    document.getElementById('amTitle').textContent =
      state.uiStyle === 'pixel' ? '🏆 交付悬赏 · 领取二课学分' : '确认参加并记录二课成绩';
    document.getElementById('amActName').textContent = item.title;
    document.getElementById('amHint').textContent =
      item.credit_hint || '系统已自动匹配所属模块，可按实际加分确认或修改分值。';
    document.getElementById('amModule').value = inferredMod;
    document.getElementById('amScore').value = String(defaultScore);

    const quickChoices = candidates.length ? [...new Set([...candidates, 5, 10, 15])].slice(0, 5) : [5, 6, 10, 15, 20];
    const qWrap = document.getElementById('amQuickScores');
    qWrap.innerHTML = quickChoices
      .map(
        (v) =>
          `<button type="button" class="rm-quick-btn ${Number(v) === Number(defaultScore) ? 'active' : ''}" data-qscore="${v}">+${v}分</button>`
      )
      .join('');

    document.getElementById('attendModal').classList.remove('hidden');
    haptic(10);
  });
}

function closeAttendModal() {
  document.getElementById('attendModal').classList.add('hidden');
  state.pendingAttendActivity = null;
}

function openManualCreditModal(prefill = null) {
  requireStudentAuth(() => {
    state.editingManualId = prefill?.id || null;
    document.getElementById('mcTitle').textContent = state.editingManualId ? '修改二课成绩记录' : '手动增加二课成绩';
    document.getElementById('mcName').value = prefill?.title || '';
    document.getElementById('mcModule').value = prefill?.module_key || 'moral';
    document.getElementById('mcScore').value = prefill?.score !== undefined ? String(prefill.score) : '10';
    document.getElementById('mcDate').value = prefill?.event_date || new Date().toISOString().slice(0, 10);
    document.getElementById('mcNote').value = prefill?.note || '';
    document.getElementById('manualCreditModal').classList.remove('hidden');
    haptic(8);
  });
}

function closeManualCreditModal() {
  document.getElementById('manualCreditModal').classList.add('hidden');
  state.editingManualId = null;
}

function buildSyncCodeString() {
  if (!state.studentUser) return '';
  const payload = {
    v: 1,
    u: state.studentUser.username,
    d: state.studentUser.display_name,
    r: state.studentRecords.map((r) => ({
      activity_id: r.activity_id ?? null,
      title: r.title,
      module_key: r.module_key,
      score: r.score,
      status: r.status,
      event_date: r.event_date || '',
      note: r.note || '',
    })),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return 'BUCT2K:' + btoa(bin);
}

function parseSyncCodeString(raw) {
  const s = String(raw || '').trim();
  if (!s.startsWith('BUCT2K:')) throw new Error('口令格式无效，应以 BUCT2K: 开头');
  const bin = atob(s.slice(7).trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const obj = JSON.parse(new TextDecoder().decode(bytes));
  if (!obj || !Array.isArray(obj.r)) throw new Error('口令内容损坏，无法解析');
  return obj;
}

function openSyncCodeModal() {
  document.getElementById('scExportBox').value = state.studentUser
    ? buildSyncCodeString()
    : '（登录后将生成当前账号的备份口令）';
  document.getElementById('scImportBox').value = '';
  document.getElementById('scCopyBtn').textContent = '📋 复制我的备份口令';
  document.getElementById('syncCodeModal').classList.remove('hidden');
}

function closeSyncCodeModal() {
  document.getElementById('syncCodeModal').classList.add('hidden');
}

function exportCreditsCsv() {
  const attended = state.studentRecords.filter((r) => r.status === 'attended');
  if (!attended.length) {
    showGlassToast('当前还没有已参加的成绩记录', 'warn');
    return;
  }
  const rows = [['活动名称', '所属模块', '分值', '日期', '备注']];
  for (const r of attended) {
    const mod = BUCT_MODULE_MAP[r.module_key]?.name || r.module_key;
    rows.push([r.title, mod, String(r.score), r.event_date || '', r.note || '']);
  }
  const csv = '\uFEFF' + rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `北化二课成绩单_${state.studentUser?.username || 'export'}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  showGlassToast('⬇ 已导出北化二课成绩单 CSV', 'success');
}

/* ==================== 本地快照 & 静音提醒 ==================== */
function saveSnapshotToCache(meta, items) {
  try {
    const payload = { meta, allItems: items, cachedAt: new Date().toISOString() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    return payload.cachedAt;
  } catch {
    return null;
  }
}

function loadSnapshotFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.allItems)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadReminders() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REMIND_KEY) || '{}');
    state.reminders = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    state.reminders = {};
  }
}

function saveReminders() {
  try {
    localStorage.setItem(REMIND_KEY, JSON.stringify(state.reminders));
  } catch {}
}

function triggerSilentReminder(itemId, rem) {
  try {
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
  } catch {}
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification('⏰ 二课活动报名提醒', {
        body: rem.title,
        silent: true,
        tag: `buct-act-${itemId}`,
      });
      n.onclick = () => {
        window.focus();
        if (rem.url) window.open(rem.url, '_blank', 'noopener,noreferrer');
      };
    } catch {}
  }
  const toast = document.getElementById('reminderToast');
  if (toast) {
    toast.classList.remove('hidden');
    toast.innerHTML = `
      <div><strong>⏰ 报名提醒：</strong>${escapeHtml(rem.title)}</div>
      <div style="display:flex;gap:8px;flex-shrink:0">
        ${rem.url ? `<a class="btn btn-sm btn-primary" href="${escapeHtml(rem.url)}" target="_blank" rel="noopener noreferrer">去报名 ↗</a>` : ''}
        <button type="button" class="btn btn-sm" id="dismissToastBtn">知道了</button>
      </div>
    `;
    document.getElementById('dismissToastBtn')?.addEventListener('click', () => toast.classList.add('hidden'));
  }
}

function checkDueReminders() {
  const now = Date.now();
  let changed = false;
  for (const [id, rem] of Object.entries(state.reminders)) {
    if (!rem || rem.fired) continue;
    if (now >= rem.atMs) {
      rem.fired = true;
      changed = true;
      triggerSilentReminder(id, rem);
    }
  }
  if (changed) {
    saveReminders();
    renderFilteredLocal();
  }
}

function downloadSilentIcs(item, atMs) {
  const dt = new Date(atMs);
  const fmtUtc = (d) =>
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(
      d.getUTCMinutes()
    )}00Z`;
  const endDt = new Date(atMs + 15 * 60 * 1000);
  const cleanTitle = String(item.title || '二课活动报名').replace(/[\r\n,;]/g, ' ');
  const url = safeHref(item.source_article_url);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BUCT Activity Hub//CN',
    'BEGIN:VEVENT',
    `UID:buct-act-${item.id}-${atMs}@hub`,
    `DTSTAMP:${fmtUtc(new Date())}`,
    `DTSTART:${fmtUtc(dt)}`,
    `DTEND:${fmtUtc(endDt)}`,
    `SUMMARY:二课报名：${cleanTitle}`,
    `DESCRIPTION:${(item.credit_hint || '').replace(/[\r\n]/g, ' ')} ${url}`,
    ...(url ? [`URL:${url}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:PT0M',
    `DESCRIPTION:二课报名提醒：${cleanTitle}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `二课提醒-${item.id}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ==================== 筛选、智能排序（过 5 分钟后退）与精炼卡片渲染 ==================== */
function updateFreshnessUI() {
  const pill = document.getElementById('livePill');
  const statusText = document.getElementById('liveStatusText');
  const lastText = document.getElementById('lastUpdateText');
  const banner = document.getElementById('cacheBanner');
  const bannerText = document.getElementById('cacheBannerText');

  if (state.isOfflineCache) {
    pill?.classList.add('offline');
    if (statusText) statusText.textContent = '离线缓存';
    if (banner && bannerText) {
      banner.classList.remove('hidden');
      bannerText.textContent = `离线浏览缓存（上次同步：${formatAgo(state.lastSyncedAt) || '较早'}）`;
    }
    return;
  }
  pill?.classList.remove('offline');
  banner?.classList.add('hidden');
  const crawlAgo = formatAgo(state.meta?.stats?.lastCrawledAt || state.lastSyncedAt);
  if (statusText) statusText.textContent = crawlAgo ? `已同步 · ${crawlAgo}` : '实时同步';
  if (lastText) {
    const total = state.allItems.length;
    lastText.textContent = `共 ${total} 项活动`;
  }
}

function renderTagBar() {
  const tagBar = document.getElementById('tagBar');
  if (!tagBar || !state.meta) return;
  tagBar.classList.add('liquid-track');
  const total = state.allItems.length;
  const tags = state.meta.tags || [];
  const sig = `${total}|${tags.map((t) => `${t.id}:${t.name}:${t.color}:${t.published_count || 0}`).join('|')}`;
  const rebuilt = tagBar.dataset.sig !== sig || !tagBar.querySelector(':scope > .liquid-pill-bg');

  if (rebuilt) {
    const parts = [
      '<span class="liquid-pill-bg" aria-hidden="true"></span>',
      `<button class="chip ${state.tagId === '' ? 'active' : ''}" data-tag-id="" type="button" style="--c:#0e1116">
        <span>全部</span><span class="chip-count">${total}</span>
      </button>`,
    ];
    for (const tag of tags) {
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
    tagBar.dataset.sig = sig;
  } else {
    tagBar.querySelectorAll('.chip').forEach((btn) => {
      btn.classList.toggle('active', String(btn.dataset.tagId || '') === String(state.tagId));
    });
  }
  requestAnimationFrame(() => syncLiquidTrack('tagBar', '.chip.active', rebuilt));
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
  ['sourceFilter', 'fsSourceSelect'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = html;
      el.value = state.source;
    }
  });
}

function filterItemsLocally(items) {
  const needle = state.q.toLowerCase();
  return (items || []).filter((item) => {
    const regSt = getRegistrationStatus(item);
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
      if ((sa.kind === 'low_stock') !== (sb.kind === 'low_stock')) return sa.kind === 'low_stock' ? 1 : -1;
      const ta = sa.targetMs || Number.MAX_SAFE_INTEGER;
      const tb = sb.targetMs || Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      return pubMs(b) - pubMs(a);
    });
    return arr;
  }

  // 智能排序：刚开抢≤5m -> 即将开抢 -> 即将截止 -> 常规可报 -> 详见推文 -> 过5分钟余量可能不足(自动后退) -> 已截止沉底
  const rankMap = { golden: 0, upcoming: 1, urgent: 2, open: 3, unknown: 4, low_stock: 5, ended: 6 };
  arr.sort((a, b) => {
    const sa = getRegistrationStatus(a);
    const sb = getRegistrationStatus(b);
    const ra = rankMap[sa.kind] ?? 4;
    const rb = rankMap[sb.kind] ?? 4;
    if (ra !== rb) return ra - rb;
    if ((ra === 1 || ra === 2) && sa.targetMs && sb.targetMs && sa.targetMs !== sb.targetMs) {
      return sa.targetMs - sb.targetMs;
    }
    return pubMs(b) - pubMs(a);
  });
  return arr;
}

function renderCard(item, idx = 0, animate = false) {
  const primary = (item.tags || [])[0];
  const accent = safeColor(primary?.color);
  const regSt = getRegistrationStatus(item);
  const isUncertain = Boolean(item.is_uncertain) || (item.tags || []).some((t) => /存疑/.test(t.name));
  const isHot = regSt.kind === 'golden' || regSt.kind === 'urgent';
  const isPixel = state.uiStyle === 'pixel';
  const qMeta = getQuestMeta(item, regSt, isUncertain);
  const audShort = compactAudienceLabel(item);
  const scoreShort = compactCreditLabel(item, isUncertain);
  const timeBrief = compactTimeBrief(item, regSt);
  const myRec = getRecordForActivity(item.id);
  const rem = state.reminders[item.id];
  const isArmed = Boolean(rem && !rem.fired);

  let myTagHtml = '';
  if (myRec?.status === 'attended') {
    myTagHtml = `<span class="my-state-tag done">${isPixel ? '✓ 已领' : '✓'} +${myRec.score}</span>`;
  } else if (myRec?.status === 'registered') {
    myTagHtml = `<span class="my-state-tag reg">${isPixel ? '⚔ 已接' : '已报名'}</span>`;
  } else if (isArmed) {
    myTagHtml = `<span class="my-state-tag reg">🔔</span>`;
  }

  const enterClass = animate ? 'card-enter' : '';
  const staggerStyle = animate ? `--i:${Math.min(idx, 10)};` : '';
  const catName = primary ? primary.name.replace(/·.*$/, '') : '二课';

  return `
    <article class="act-card ${regSt.ended ? 'is-ended' : ''} ${regSt.kind === 'low_stock' ? 'is-low-stock' : ''} ${
      isHot ? 'is-hot' : ''
    } ${enterClass}" data-card-id="${item.id}" style="${staggerStyle}--accent:${accent}">
      <div class="act-top">
        <div class="act-cat-wrap">
          <span class="quest-rank-tag ${qMeta.cls}">${escapeHtml(qMeta.label)}</span>
          <span class="act-cat-pill" style="--c:${accent}">${escapeHtml(catName)}</span>
        </div>
        <span class="reg-pill ${regSt.kind}" data-reg-pill="${item.id}">${escapeHtml(regSt.label)}</span>
      </div>

      <h2 class="act-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h2>

      <div class="act-meta-pills">
        <span class="meta-chip ${audShort.cls}">${isPixel ? '🛡' : '👥'} ${escapeHtml(audShort.text)}</span>
        ${scoreShort ? `<span class="meta-chip score">${isPixel ? '🪙' : '✦'} ${escapeHtml(scoreShort)}</span>` : ''}
      </div>

      <div class="act-bottom">
        <span class="act-time-brief ${timeBrief.hi ? 'hi' : ''}">${escapeHtml(timeBrief.text)}</span>
        <span class="act-bottom-right">
          ${myTagHtml || `<span class="act-src-mini">${escapeHtml(item.source_account_name)}</span>`}
        </span>
      </div>
    </article>
  `;
}

function syncFilterControlsUI(matchedCount) {
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v;
  };
  const setChk = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.checked = v;
  };
  setChk('hideEndedCheck', state.hideEnded);
  setChk('fsHideEndedCheck', state.hideEnded);
  setVal('audienceFilter', state.audienceFilter);
  setVal('sortSelect', state.sortBy);
  setVal('sourceFilter', state.source);
  setVal('fsSourceSelect', state.source);

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
  const freshSection = document.getElementById('freshSection');
  const freshGrid = document.getElementById('freshGrid');
  const freshMeta = document.getElementById('freshSectionMeta');
  const allBar = document.getElementById('allSectionBar');
  const allMeta = document.getElementById('allSectionMeta');
  const grid = document.getElementById('activitiesGrid');

  const filtered = filterItemsLocally(state.allItems);
  syncFilterControlsUI(filtered.length);

  if (!filtered.length) {
    freshSection.classList.add('hidden');
    allBar.classList.add('hidden');
    grid.innerHTML = '<div class="empty-box">暂无符合条件的活动</div>';
    return;
  }

  // 第一排「刚刚更新」：默认智能排序且未搜索时，抽取最新发布的 3 条（手机 2 条）未截止、非余量不足的活动
  const showFreshRow = state.sortBy === 'smart' && !state.q && filtered.length > 3;
  const freshCap = window.innerWidth <= 720 ? 2 : 3;
  const freshIds = new Set();
  let freshItems = [];

  if (showFreshRow) {
    const byNewest = [...filtered].sort((a, b) => {
      const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
      const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
      return tb - ta;
    });
    freshItems = byNewest
      .filter((it) => {
        const st = getRegistrationStatus(it);
        return !st.ended && st.kind !== 'low_stock';
      })
      .slice(0, freshCap);
    freshItems.forEach((it) => freshIds.add(it.id));
  }

  if (freshItems.length > 0) {
    freshSection.classList.remove('hidden');
    allBar.classList.remove('hidden');
    const latestAgo = formatAgo(freshItems[0].published_at);
    if (freshMeta) freshMeta.textContent = latestAgo ? `最新 ${latestAgo} 发布` : '最新发布';
    freshGrid.innerHTML = freshItems.map((it, i) => renderCard(it, i, animate)).join('');
  } else {
    freshSection.classList.add('hidden');
    allBar.classList.add('hidden');
  }

  const restSorted = sortItemsLocally(filtered.filter((it) => !freshIds.has(it.id)));
  const lowStockCount = restSorted.filter((it) => getRegistrationStatus(it).kind === 'low_stock').length;
  if (allMeta) {
    allMeta.textContent =
      lowStockCount > 0 ? `已将 ${lowStockCount} 项开抢超5分钟活动自动后移` : `共 ${restSorted.length} 项`;
  }
  grid.innerHTML = restSorted.map((it, i) => renderCard(it, i + freshItems.length, animate)).join('');

  if (state.activeDetailId !== null) {
    const current = state.allItems.find((a) => a.id === state.activeDetailId);
    if (current) renderDetailSheetContent(current);
  }
}

/* ==================== 底部抽屉控制器（含手势下滑关闭） ==================== */
function syncBodySheetLock() {
  document.body.classList.toggle('sheet-open', Boolean(document.querySelector('.sheet-backdrop.open')));
}

function openSheet(sheetId) {
  const el = document.getElementById(sheetId);
  if (!el) return;
  el.style.backgroundColor = '';
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  syncBodySheetLock();
  if (sheetId === 'creditSheet') {
    requestAnimationFrame(() => {
      syncLiquidTrack('authModeTabs', '.auth-tab.active', true);
      syncLiquidTrack('creditTabs', '.credit-tab.active', true);
    });
  }
}

function closeSheet(sheetId) {
  const el = document.getElementById(sheetId);
  if (!el) return;
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  el.style.backgroundColor = '';
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
  let startedInHandle = false;

  panel.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      startedInHandle = Boolean(e.target.closest('.sheet-handle-area, .sheet-head'));
      if (!startedInHandle && body && body.scrollTop > 2) return;
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
      if (dy < 0) {
        if (startedInHandle) {
          // 向上轻拉的橡皮筋阻尼弹性 (DampedDragAnimation)
          const stretchY = -Math.min(18, Math.pow(Math.abs(dy), 0.72) * 0.55);
          currentDy = 0;
          panel.classList.add('dragging');
          panel.style.transform = `translate3d(0, ${stretchY.toFixed(1)}px, 0)`;
          backdrop.style.backgroundColor = '';
        } else if (currentDy > 0) {
          currentDy = 0;
          panel.style.transform = '';
          backdrop.style.backgroundColor = '';
        }
        return;
      }
      if (!startedInHandle && body && body.scrollTop > 2) {
        tracking = false;
        panel.classList.remove('dragging');
        panel.style.transform = '';
        backdrop.style.backgroundColor = '';
        return;
      }
      currentDy = dy;
      const visualY = dy <= 260 ? dy : 260 + (dy - 260) * 0.45;
      panel.classList.add('dragging');
      panel.style.transform = `translate3d(0, ${Math.min(visualY, 440).toFixed(1)}px, 0)`;
      const ratio = Math.min(1, dy / 320);
      backdrop.style.backgroundColor = `rgba(15, 23, 42, ${(0.46 * (1 - ratio * 0.72)).toFixed(3)})`;
    },
    { passive: true }
  );

  const finishSwipe = () => {
    if (!tracking) return;
    tracking = false;
    panel.classList.remove('dragging');
    backdrop.style.backgroundColor = '';
    if (currentDy > 85) {
      haptic(6);
      closeSheet(sheetId);
    } else {
      panel.style.transform = '';
    }
    currentDy = 0;
    startedInHandle = false;
  };
  panel.addEventListener('touchend', finishSwipe, { passive: true });
  panel.addEventListener('touchcancel', finishSwipe, { passive: true });
}

/* ==================== 活动详情抽屉（完整信息 + 报名成功/我已参加闭环） ==================== */
function renderDetailSheetContent(item) {
  const primary = (item.tags || [])[0];
  const accent = safeColor(primary?.color);
  const regSt = getRegistrationStatus(item);
  const isUncertain = Boolean(item.is_uncertain) || (item.tags || []).some((t) => /存疑/.test(t.name));
  const rem = state.reminders[item.id];
  const isArmed = Boolean(rem && !rem.fired);
  const isPixel = state.uiStyle === 'pixel';
  const qMeta = getQuestMeta(item, regSt, isUncertain);
  const audText = item.audience_text || (getAudienceObj(item).scope === 'all' ? '全校可报' : '人群详见原推文');
  const myRec = getRecordForActivity(item.id);
  const jumpUrl = safeHref(item.source_article_url);

  const regDisplay =
    item.reg_time_text ||
    (item.reg_start_at && item.reg_end_at
      ? `${formatMdHm(item.reg_start_at)} ~ ${formatMdHm(item.reg_end_at)}`
      : item.reg_start_at
      ? `${formatMdHm(item.reg_start_at)} 开始`
      : item.reg_end_at
      ? `${formatMdHm(item.reg_end_at)} 截止`
      : item.deadline || '详见原推文');

  const tagsHtml = (item.tags || [])
    .map((t) => `<span class="act-cat-pill" style="--c:${safeColor(t.color)}">${escapeHtml(t.name)}</span>`)
    .join('');

  document.getElementById('dsAccentBar').style.background = isPixel ? '#1c1c1c' : accent;
  document.getElementById('dsHeadMeta').innerHTML = `
    <span class="quest-rank-tag ${qMeta.cls}">${escapeHtml(qMeta.label)}</span>
    ${tagsHtml}
    <span class="reg-pill ${regSt.kind}" data-reg-pill="${item.id}">${escapeHtml(regSt.label)}</span>
  `;

  // 2-step personal progress bar: 报名成功 -> 我已参加活动（自动记分）
  let progressHead = '个人参与进度（自动记入二课成绩）';
  let progressButtons = '';
  if (myRec?.status === 'attended') {
    const modName = BUCT_MODULE_MAP[myRec.module_key]?.name || '二课';
    progressHead = `✓ 已参加并记入：${modName} +${myRec.score} 分`;
    progressButtons = `
      <button type="button" class="ds-step-btn success" data-ds-attend="${item.id}">✎ 修改分值 (+${myRec.score}分)</button>
      <button type="button" class="ds-step-btn subtle" data-ds-untrack="${item.id}">撤销</button>
    `;
  } else if (myRec?.status === 'registered') {
    progressHead = isPixel ? '⚔ 已接取此悬赏 · 参加完成后点下方领赏' : '✓ 已标记报名成功 · 参加后点击记录二课成绩';
    progressButtons = `
      <button type="button" class="ds-step-btn success" data-ds-attend="${item.id}">${
        isPixel ? '🏆 我已参加 · 交付领赏' : '🎉 我已参加活动（记二课分）'
      }</button>
      <button type="button" class="ds-step-btn subtle" data-ds-untrack="${item.id}">取消报名</button>
    `;
  } else {
    progressHead = isPixel ? '⚔ 悬赏状态：未接取' : '报完名点一下，参加后自动记二课分';
    progressButtons = `
      <button type="button" class="ds-step-btn primary" data-ds-register="${item.id}">${
        isPixel ? '⚔ 报名成功 / 接取悬赏' : '✓ 报名成功'
      }</button>
      <button type="button" class="ds-step-btn" data-ds-attend="${item.id}">${
        isPixel ? '🏆 我已参加' : '我已参加'
      }</button>
    `;
  }

  document.getElementById('dsBody').innerHTML = `
    <h2 class="ds-title" id="dsTitle">${escapeHtml(item.title)}</h2>
    <div class="ds-badges">
      <span class="meta-chip">${isPixel ? '🛡 招募条件：' : '👥 面向人群：'}${escapeHtml(audText)}</span>
    </div>
    ${
      item.credit_hint
        ? `<div class="ds-credit-card ${isUncertain ? 'uncertain' : ''}">${
            isUncertain ? '⚠️ ' : isPixel ? '🪙 悬赏奖励：' : '✦ 二课参考：'
          }${escapeHtml(item.credit_hint)}</div>`
        : ''
    }
    <div class="ds-progress-box">
      <div class="ds-progress-head">${escapeHtml(progressHead)}</div>
      <div class="ds-progress-actions">${progressButtons}</div>
    </div>
    <div class="ds-time-card">
      <div class="time-row">
        <span class="time-key">${isPixel ? '报名期限' : '报名日期'}</span>
        <span class="time-val reg-highlight">${escapeHtml(regDisplay)}</span>
      </div>
      ${
        item.event_time
          ? `<div class="time-row"><span class="time-key">${isPixel ? '行动时间' : '活动时间'}</span><span class="time-val">${escapeHtml(
              formatEventTimeDisplay(item.event_time)
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
        <span class="time-val muted">${escapeHtml(formatFullTime(item.published_at) || '—')}</span>
      </div>
    </div>
    <div class="ds-source-card">
      <div class="avatar" style="${avatarStyle(item.source_account_name)}">${escapeHtml(
        avatarChar(item.source_account_name)
      )}</div>
      <div class="ds-source-info">
        <div class="ds-source-name">${escapeHtml(item.source_account_name)}</div>
        <div class="ds-source-article">原推文：《${escapeHtml(item.source_article_title || item.title)}》</div>
      </div>
    </div>
    <div class="ds-extra-tools">
      <button type="button" class="ds-tool-chip" data-poster-id="${item.id}">
        ${isPixel ? '📜 生成悬赏令图' : '🖼 生成分享海报'}
      </button>
      <button type="button" class="ds-tool-chip" data-open-credits="1">
        📊 查看我的二课统计
      </button>
    </div>
  `;

  document.getElementById('dsFoot').innerHTML = `
    <button type="button" class="sheet-btn sheet-btn-secondary ${isArmed ? 'armed' : ''}" data-remind-id="${item.id}">
      ${isArmed ? '✓ 已设提醒' : '🔔 静音提醒'}
    </button>
    ${
      jumpUrl
        ? `<a class="sheet-btn sheet-btn-primary" href="${escapeHtml(
            jumpUrl
          )}" target="_blank" rel="noopener noreferrer">${isPixel ? '📜 前往原贴报名 ↗' : '阅读原推文 ↗'}</a>`
        : ''
    }
  `;
}

function openDetailSheet(item) {
  state.activeDetailId = item.id;
  renderDetailSheetContent(item);
  openSheet('detailSheet');
  haptic(8);
}

/* ==================== 静音提醒弹窗 ==================== */
function openRemindModal(item) {
  state.editingRemindItem = item;
  document.getElementById('rmActName').textContent = item.title;
  const existing = state.reminders[item.id];
  document.getElementById('rmCancelExisting').classList.toggle('hidden', !existing || existing.fired);

  const regSt = getRegistrationStatus(item);
  const targetMs = regSt.targetMs;
  const quickWrap = document.getElementById('rmQuickWrap');
  const customInput = document.getElementById('rmCustomTime');
  const quickButtons = [];
  if (targetMs && targetMs > Date.now() + 60 * 1000) {
    const base = regSt.kind === 'upcoming' ? '开抢前' : '截止前';
    if (targetMs - 10 * 60 * 1000 > Date.now()) quickButtons.push({ label: `${base} 10 分钟`, ms: targetMs - 10 * 60 * 1000 });
    if (targetMs - 5 * 60 * 1000 > Date.now()) quickButtons.push({ label: `${base} 5 分钟`, ms: targetMs - 5 * 60 * 1000 });
    quickButtons.push({ label: regSt.kind === 'upcoming' ? '开抢准点' : '截止前 1 分钟', ms: targetMs - 60 * 1000 });
  } else {
    quickButtons.push(
      { label: '10 分钟后', ms: Date.now() + 10 * 60 * 1000 },
      { label: '30 分钟后', ms: Date.now() + 30 * 60 * 1000 },
      { label: '1 小时后', ms: Date.now() + 60 * 60 * 1000 }
    );
  }
  const defaultMs = existing && !existing.fired ? existing.atMs : quickButtons[0].ms;
  customInput.value = toDatetimeLocalValue(defaultMs);
  quickWrap.innerHTML = quickButtons
    .map((b, i) => `<button type="button" class="rm-quick-btn ${i === 0 ? 'active' : ''}" data-ms="${b.ms}">${b.label}</button>`)
    .join('');
  document.getElementById('remindModal').classList.remove('hidden');
}

function closeRemindModal() {
  document.getElementById('remindModal').classList.add('hidden');
  state.editingRemindItem = null;
}

/* ==================== 纯前端二维码 + 双风格分享海报图 ==================== */
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
  while (dataBytes.length < spec.dataCw) dataBytes.push(padSeq[pi++ % 2]);

  const gfMul = (a, b) => {
    let r = 0, x = a, y = b;
    while (y > 0) {
      if (y & 1) r ^= x;
      x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
      y >>= 1;
    }
    return r;
  };
  let gen = [1], root = 1;
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

  const blkLen = spec.dataCw / spec.blocks;
  const dBlocks = [], eBlocks = [];
  for (let b = 0; b < spec.blocks; b++) {
    const chunk = dataBytes.slice(b * blkLen, (b + 1) * blkLen);
    dBlocks.push(chunk);
    eBlocks.push(rsEncode(chunk));
  }
  const finalCw = [];
  for (let i = 0; i < blkLen; i++) for (let b = 0; b < spec.blocks; b++) finalCw.push(dBlocks[b][i]);
  for (let i = 0; i < spec.ec; i++) for (let b = 0; b < spec.blocks; b++) finalCw.push(eBlocks[b][i]);

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
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= N || c >= N) continue;
        const inB = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        setFn(r, c, inB && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)));
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
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) setFn(ar + dr, ac + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
  setFn(N - 8, 8, 1);
  for (let i = 0; i <= 8; i++) {
    if (!isFn[8][i]) setFn(8, i, 0);
    if (!isFn[i][8]) setFn(i, 8, 0);
  }
  for (let i = 0; i < 8; i++) {
    if (!isFn[8][N - 1 - i]) setFn(8, N - 1 - i, 0);
    if (!isFn[N - 1 - i][8]) setFn(N - 1 - i, 8, 0);
  }
  const allBits = [];
  for (const cw of finalCw) for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1);
  let bi = 0, up = true;
  for (let col = N - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;
    for (let step = 0; step < N; step++) {
      const r = up ? N - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!isFn[r][c]) mat[r][c] = bi < allBits.length ? allBits[bi++] : 0;
      }
    }
    up = !up;
  }
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
    for (let i = 4; i >= 0; i--) if ((rem >> (i + 10)) & 1) rem ^= 0x537 << i;
    const fmt = ((d << 10) | rem) ^ 0x5412;
    const bit = (idx) => (fmt >> idx) & 1;
    const tl = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    for (let i = 0; i < 15; i++) grid[tl[i][0]][tl[i][1]] = bit(14 - i);
    for (let i = 0; i < 7; i++) grid[N - 1 - i][8] = bit(14 - i);
    for (let i = 0; i < 8; i++) grid[8][N - 8 + i] = bit(7 - i);
  };
  let bestGrid = null, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const g = mat.map((row, r) => row.map((v, c) => (!isFn[r][c] && maskFns[m](r, c) ? v ^ 1 : v)));
    writeFormat(g, m);
    let score = 0, dark = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        dark += g[r][c];
        if (r > 0 && c > 0 && g[r][c] === g[r - 1][c] && g[r][c] === g[r][c - 1] && g[r][c] === g[r - 1][c - 1]) score += 3;
      }
    }
    score += Math.abs(Math.round((dark * 100) / (N * N)) - 50) * 2;
    if (score < bestScore) { bestScore = score; bestGrid = g; }
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
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
      if (lines.length >= maxLines) {
        lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
        return lines;
      }
    } else cur = test;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

function drawQrOnCanvas(ctx, qrMat, qrX, qrY, qrBoxSize, darkColor = '#0f172a') {
  if (!qrMat) return;
  const N = qrMat.length;
  const cell = qrBoxSize / N;
  ctx.fillStyle = darkColor;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (qrMat[r][c]) {
        ctx.fillRect(Math.floor(qrX + c * cell), Math.floor(qrY + r * cell), Math.ceil(cell), Math.ceil(cell));
      }
    }
  }
}

function generatePosterDataUrl(item) {
  const isPixel = state.uiStyle === 'pixel';
  const regSt = getRegistrationStatus(item);
  const primary = (item.tags || [])[0];
  const accent = safeColor(primary?.color);
  const tagName = primary?.name || '二课活动';
  const audShort = compactAudienceLabel(item).text;
  const scoreShort = compactCreditLabel(item, Boolean(item.is_uncertain)) || '详见推文';
  const regDisplay = compactTimeBrief(item, regSt).text.replace(/^报名\s+/, '');
  const jumpUrl = safeHref(item.source_article_url);
  const W = 750, H = 1040;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const FONT = '"PingFang SC", "Microsoft YaHei", sans-serif';

  if (isPixel) {
    ctx.fillStyle = '#f4e9c8';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(46, 46, W - 76, H - 76);
    ctx.fillStyle = '#fbf5dd';
    ctx.fillRect(34, 34, W - 76, H - 76);
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineWidth = 6;
    ctx.strokeRect(34, 34, W - 76, H - 76);
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(54, 54, W - 116, 88);
    ctx.fillStyle = '#f0a232';
    ctx.fillRect(54, 136, W - 116, 6);
    ctx.font = `800 30px ${FONT}`;
    ctx.fillStyle = '#fbf5dd';
    ctx.fillText('⚔  WANTED · 北化二课悬赏令', 78, 110);
  } else {
    ctx.fillStyle = '#f2f2f1';
    ctx.fillRect(0, 0, W, H);
    const a1 = ctx.createRadialGradient(140, 100, 10, 140, 100, 360);
    a1.addColorStop(0, 'rgba(255,213,189,0.72)');
    a1.addColorStop(1, 'rgba(255,213,189,0)');
    ctx.fillStyle = a1;
    ctx.fillRect(0, 0, W, 500);
    const a2 = ctx.createRadialGradient(620, 120, 10, 620, 120, 340);
    a2.addColorStop(0, 'rgba(159,223,251,0.65)');
    a2.addColorStop(1, 'rgba(159,223,251,0)');
    ctx.fillStyle = a2;
    ctx.fillRect(0, 0, W, 500);
    ctx.font = `700 24px ${FONT}`;
    ctx.fillStyle = '#0e1116';
    ctx.fillText('✦ 北化二课活动', 48, 76);
    drawRoundedRect(ctx, 36, 112, W - 72, H - 150, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(23,23,23,0.09)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  let y = 216;
  ctx.font = `700 24px ${FONT}`;
  ctx.fillStyle = isPixel ? '#2e5dd6' : accent;
  ctx.fillText(`${tagName} · ${regSt.label}`, 74, y);
  y += 66;
  ctx.font = `800 42px ${FONT}`;
  ctx.fillStyle = isPixel ? '#1c1c1c' : '#0e1116';
  for (const line of wrapCanvasText(ctx, item.title, W - 148, 3)) {
    ctx.fillText(line, 74, y);
    y += 58;
  }
  y += 26;
  const rows = [
    { k: isPixel ? '🪙 悬赏学分' : '二课参考', v: scoreShort },
    { k: isPixel ? '🛡 招募对象' : '面向人群', v: audShort },
    { k: isPixel ? '⏱ 报名期限' : '报名日期', v: regDisplay },
    { k: isPixel ? '🏰 发布公会' : '来源公众号', v: item.source_account_name || '校内公众号' },
  ];
  const boxH = rows.length * 58 + 30;
  if (isPixel) {
    ctx.fillStyle = '#ead8a3';
    ctx.fillRect(74, y, W - 148, boxH);
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineWidth = 3;
    ctx.strokeRect(74, y, W - 148, boxH);
  } else {
    drawRoundedRect(ctx, 74, y, W - 148, boxH, 18);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
  }
  let ry = y + 50;
  for (const row of rows) {
    ctx.font = `600 23px ${FONT}`;
    ctx.fillStyle = isPixel ? '#6d5526' : '#64748b';
    ctx.fillText(row.k, 98, ry);
    ctx.font = `700 24px ${FONT}`;
    ctx.fillStyle = isPixel ? '#1c1c1c' : '#0e1116';
    const vStr = wrapCanvasText(ctx, row.v, W - 360, 1)[0] || row.v;
    ctx.fillText(vStr, W - 98 - ctx.measureText(vStr).width, ry);
    ry += 58;
  }

  const footY = H - 244;
  const qrTarget = jumpUrl && new TextEncoder().encode(jumpUrl).length <= 134 ? jumpUrl : HUB_PUBLIC_URL;
  const qrMat = makeQrMatrix(qrTarget) || makeQrMatrix(HUB_PUBLIC_URL);
  const qrSize = 148;
  const qrX = W - 74 - qrSize;
  const qrY = footY + 24;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);
  ctx.strokeStyle = isPixel ? '#1c1c1c' : '#e2e8f0';
  ctx.lineWidth = isPixel ? 4 : 2;
  ctx.strokeRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);
  drawQrOnCanvas(ctx, qrMat, qrX, qrY, qrSize, isPixel ? '#1c1c1c' : '#0e1116');

  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = isPixel ? '#1c1c1c' : '#0e1116';
  ctx.fillText(qrTarget === jumpUrl ? '扫码直达原推文' : '扫码查看北化二课', 74, footY + 78);
  ctx.font = `500 21px ${FONT}`;
  ctx.fillStyle = isPixel ? '#6d5526' : '#64748b';
  ctx.fillText('长按识别二维码 · 北化二课实时聚合', 74, footY + 122);
  return canvas.toDataURL('image/png');
}

function openPosterModal(item) {
  state.posterItem = item;
  state.posterDataUrl = generatePosterDataUrl(item);
  document.getElementById('posterPreviewImg').src = state.posterDataUrl;
  document.getElementById('posterCopyBtn').textContent = '🔗 复制推文链接';
  document.getElementById('posterModal').classList.remove('hidden');
  haptic(10);
}

function closePosterModal() {
  document.getElementById('posterModal').classList.add('hidden');
  state.posterItem = null;
}

/* ==================== 数据加载 ==================== */
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
      return { meta, items: fullData.items || [], isStaticMirror: false };
    } catch (err) {
      if (!String(err?.message || '').includes('404')) throw err;
    }
  }
  const snapshot = await fetchJsonWithTimeout(`./data.json?t=${Date.now()}`, 8000);
  return { meta: snapshot.meta || {}, items: snapshot.items || [], isStaticMirror: true };
}

function applyMetaToDom() {
  if (!state.meta) return;
  document.title = state.meta.siteTitle || '北化二课活动';
  document.getElementById('siteTitle').textContent = state.meta.siteTitle || '北化二课活动';
  renderTagBar();
  renderSourceSelect();
  updateFreshnessUI();
}

async function refreshAll() {
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn?.classList.add('spinning');
  try {
    const result = await loadLiveOrMirrorData();
    state.meta = result.meta;
    state.allItems = result.items;
    state.isOfflineCache = false;
    state.isStaticMirror = result.isStaticMirror;
    state.lastSyncedAt = saveSnapshotToCache(result.meta, state.allItems);
    applyMetaToDom();
    updateStudentUI();
    renderFilteredLocal();
  } catch (err) {
    const cached = loadSnapshotFromCache();
    if (cached) {
      state.meta = cached.meta;
      state.allItems = cached.allItems;
      state.isOfflineCache = true;
      state.lastSyncedAt = cached.cachedAt;
      applyMetaToDom();
      updateStudentUI();
      renderFilteredLocal();
    } else {
      document.getElementById('activitiesGrid').innerHTML = `<div class="empty-box">数据加载失败（${escapeHtml(
        err.message
      )}）</div>`;
    }
  } finally {
    setTimeout(() => refreshBtn?.classList.remove('spinning'), 260);
  }
}

/* ==================== 事件绑定 ==================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

document.getElementById('themeToggle')?.addEventListener('click', toggleDarkLightTheme);
document.getElementById('fsThemeBtn')?.addEventListener('click', toggleDarkLightTheme);
document.getElementById('fsRefreshBtn')?.addEventListener('click', () => {
  closeSheet('filterSheet');
  refreshAll();
});

document.getElementById('uiStyleSwitch').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-ui-choice]');
  if (btn) setUiStyle(btn.dataset.uiChoice);
});
document.getElementById('uiStyleMobileBtn').addEventListener('click', () => {
  setUiStyle(state.uiStyle === 'pixel' ? 'minimal' : 'pixel');
});

document.getElementById('accountBtn').addEventListener('click', () => {
  updateStudentUI();
  openSheet('creditSheet');
  haptic(8);
});
document.getElementById('questSlimBar').addEventListener('click', () => {
  updateStudentUI();
  openSheet('creditSheet');
  haptic(8);
});

// 筛选与搜索
document.getElementById('tagBar').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  state.tagId = btn.dataset.tagId || '';
  haptic(8);
  renderTagBar();
  btn.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  renderFilteredLocal({ animate: true });
});

['sourceFilter', 'fsSourceSelect'].forEach((id) => {
  document.getElementById(id)?.addEventListener('change', (e) => {
    state.source = e.target.value;
    renderFilteredLocal({ animate: true });
  });
});

document.getElementById('audienceFilter').addEventListener('change', (e) => {
  state.audienceFilter = e.target.value;
  renderFilteredLocal({ animate: true });
});
document.getElementById('sortSelect').addEventListener('change', (e) => {
  state.sortBy = e.target.value || 'smart';
  renderFilteredLocal({ animate: true });
});
['hideEndedCheck', 'fsHideEndedCheck'].forEach((id) => {
  document.getElementById(id)?.addEventListener('change', (e) => {
    state.hideEnded = e.target.checked;
    renderFilteredLocal({ animate: true });
  });
});

document.getElementById('mobileFilterBtn').addEventListener('click', () => {
  syncFilterControlsUI(filterItemsLocally(state.allItems).length);
  openSheet('filterSheet');
  haptic(8);
});
document.getElementById('fsSortPills').addEventListener('click', (e) => {
  const btn = e.target.closest('.fs-pill');
  if (!btn) return;
  state.sortBy = btn.dataset.sort || 'smart';
  haptic(8);
  renderFilteredLocal({ animate: true });
});
document.getElementById('fsAudiencePills').addEventListener('click', (e) => {
  const btn = e.target.closest('.fs-pill');
  if (!btn) return;
  state.audienceFilter = btn.dataset.audience || '';
  haptic(8);
  renderFilteredLocal({ animate: true });
});
document.getElementById('fsResetBtn').addEventListener('click', () => {
  state.sortBy = 'smart';
  state.audienceFilter = '';
  state.source = '';
  state.hideEnded = false;
  haptic(10);
  renderFilteredLocal({ animate: true });
  showGlassToast('已重置全部筛选条件');
});
document.getElementById('fsDoneBtn').addEventListener('click', () => closeSheet('filterSheet'));

let searchTimer = null;
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = e.target.value.trim();
    renderFilteredLocal();
  }, 150);
});

// 点击第一排或主网格卡片 -> 打开详情抽屉
function handleGridCardClick(e) {
  const card = e.target.closest('.act-card[data-card-id]');
  if (!card) return;
  const item = state.allItems.find((a) => a.id === Number(card.dataset.cardId));
  if (item) openDetailSheet(item);
}
document.getElementById('freshGrid').addEventListener('click', handleGridCardClick);
document.getElementById('activitiesGrid').addEventListener('click', handleGridCardClick);

// 详情抽屉内所有交互（报名成功 / 我已参加 / 撤销 / 提醒 / 海报 / 二课统计）
document.getElementById('detailSheet').addEventListener('click', async (e) => {
  const regBtn = e.target.closest('[data-ds-register]');
  if (regBtn) {
    const item = state.allItems.find((a) => a.id === Number(regBtn.dataset.dsRegister));
    if (!item) return;
    requireStudentAuth(async () => {
      await saveActivityRecord({
        activityId: item.id,
        title: item.title,
        moduleKey: inferModuleKeyFromItem(item),
        score: 0,
        status: 'registered',
        eventDate: formatEventTimeDisplay(item.event_time) || new Date().toISOString().slice(0, 10),
      });
      showGlassToast(
        state.uiStyle === 'pixel' ? '⚔ 悬赏已接取！参加后可领赏' : '✓ 已标记报名成功',
        'success'
      );
      haptic(14);
    });
    return;
  }

  const attendBtn = e.target.closest('[data-ds-attend]');
  if (attendBtn) {
    const item = state.allItems.find((a) => a.id === Number(attendBtn.dataset.dsAttend));
    if (item) openAttendModalForActivity(item, getRecordForActivity(item.id));
    return;
  }

  const untrackBtn = e.target.closest('[data-ds-untrack]');
  if (untrackBtn) {
    const aid = Number(untrackBtn.dataset.dsUntrack);
    await saveActivityRecord({ activityId: aid, status: 'none' });
    showGlassToast('已取消该活动标记');
    haptic(10);
    return;
  }

  const remBtn = e.target.closest('[data-remind-id]');
  if (remBtn) {
    const item = state.allItems.find((a) => a.id === Number(remBtn.dataset.remindId));
    if (item) openRemindModal(item);
    return;
  }

  const posterBtn = e.target.closest('[data-poster-id]');
  if (posterBtn) {
    const item = state.allItems.find((a) => a.id === Number(posterBtn.dataset.posterId));
    if (item) openPosterModal(item);
    return;
  }

  if (e.target.closest('[data-open-credits]')) {
    closeSheet('detailSheet');
    updateStudentUI();
    openSheet('creditSheet');
  }
});

// 个人二课账号表单 & 仪表盘事件
document.getElementById('authModeTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.auth-tab');
  if (!tab) return;
  state.authMode = tab.dataset.authMode === 'login' ? 'login' : 'register';
  document.getElementById('saError').classList.add('hidden');
  updateStudentUI();
});

document.getElementById('studentAuthForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('saError');
  errEl.classList.add('hidden');
  const uname = document.getElementById('saUsername').value.trim();
  const dname = document.getElementById('saDisplayName').value.trim();
  const pass = document.getElementById('saPassword').value;
  try {
    const wasReg = state.authMode === 'register';
    if (wasReg) {
      await studentRegister(uname, dname, pass);
    } else {
      await studentLogin(uname, pass);
    }
    document.getElementById('saPassword').value = '';
    showGlassToast(
      wasReg
        ? state.uiStyle === 'pixel'
          ? '⚔ 冒险者档案已创建！'
          : '🎉 二课账号已创建'
        : '✓ 欢迎回来，已同步二课成绩',
      'success'
    );
    haptic(14);
    if (typeof state.afterLoginAction === 'function') {
      const fn = state.afterLoginAction;
      state.afterLoginAction = null;
      closeSheet('creditSheet');
      fn();
    } else {
      renderFilteredLocal();
    }
  } catch (err) {
    errEl.textContent = err.message || '操作失败';
    errEl.classList.remove('hidden');
  }
});

document.getElementById('studentLogoutBtn').addEventListener('click', async () => {
  await studentLogout();
  showGlassToast('已退出当前二课账号');
  haptic(10);
});

document.getElementById('creditTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.credit-tab');
  if (!tab) return;
  state.creditTab = tab.dataset.ctab || 'overview';
  updateStudentUI();
});

document.getElementById('historyModFilter').addEventListener('change', (e) => {
  state.historyModuleFilter = e.target.value;
  updateStudentUI();
});

document.getElementById('openManualAddBtn').addEventListener('click', () => openManualCreditModal());
document.getElementById('openManualAddBtn2').addEventListener('click', () => openManualCreditModal());
document.getElementById('exportCsvBtn').addEventListener('click', exportCreditsCsv);
document.getElementById('openSyncCodeBtn').addEventListener('click', openSyncCodeModal);
document.getElementById('openImportFromAuthBtn').addEventListener('click', openSyncCodeModal);

document.getElementById('mqPresets').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-preset-title]');
  if (!chip) return;
  openManualCreditModal({
    title: chip.dataset.presetTitle,
    module_key: chip.dataset.presetMod,
    score: Number(chip.dataset.presetScore || 10),
  });
});

document.getElementById('creditSheetBody').addEventListener('click', async (e) => {
  const settleBtn = e.target.closest('[data-settle-rec-id]');
  if (settleBtn) {
    const rec = state.studentRecords.find((r) => Number(r.id) === Number(settleBtn.dataset.settleRecId));
    if (!rec) return;
    const item = state.allItems.find((a) => Number(a.id) === Number(rec.activity_id)) || {
      id: rec.activity_id,
      title: rec.title,
      credit_hint: '',
      tags: [],
    };
    openAttendModalForActivity(item, rec);
    return;
  }

  const editBtn = e.target.closest('[data-edit-rec-id]');
  if (editBtn) {
    const rec = state.studentRecords.find((r) => Number(r.id) === Number(editBtn.dataset.editRecId));
    if (rec) openManualCreditModal(rec);
    return;
  }

  const delBtn = e.target.closest('[data-del-rec-id]');
  if (delBtn) {
    if (!confirm('确认删除这条记录吗？')) return;
    await removeStudentRecord(Number(delBtn.dataset.delRecId));
    showGlassToast('已删除该条二课记录');
    haptic(10);
  }
});

// 「我已参加活动」快捷记分确认弹窗
document.getElementById('amClose').addEventListener('click', closeAttendModal);
document.getElementById('amCancelBtn').addEventListener('click', closeAttendModal);
document.getElementById('attendModal').addEventListener('click', (e) => {
  if (e.target.id === 'attendModal') closeAttendModal();
});
document.getElementById('amQuickScores').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-qscore]');
  if (!btn) return;
  document.getElementById('amScore').value = btn.dataset.qscore;
  document.querySelectorAll('#amQuickScores .rm-quick-btn').forEach((b) => b.classList.toggle('active', b === btn));
  haptic(8);
});
document.getElementById('amSaveBtn').addEventListener('click', async () => {
  if (!state.pendingAttendActivity) return;
  const { item, existingRec } = state.pendingAttendActivity;
  const moduleKey = document.getElementById('amModule').value;
  const score = Math.max(0, Number(document.getElementById('amScore').value) || 0);
  if (item.id) {
    await saveActivityRecord({
      activityId: item.id,
      title: item.title,
      moduleKey,
      score,
      status: 'attended',
      eventDate: new Date().toISOString().slice(0, 10),
    });
  } else if (existingRec?.id) {
    await saveManualRecord({
      id: existingRec.id,
      title: existingRec.title,
      moduleKey,
      score,
      eventDate: new Date().toISOString().slice(0, 10),
      note: existingRec.note || '',
    });
  }
  closeAttendModal();
  const modName = BUCT_MODULE_MAP[moduleKey]?.name || '二课';
  showGlassToast(
    state.uiStyle === 'pixel' ? `🏆 悬赏交付！${modName} +${score}分` : `✓ 已记入 ${modName} +${score}分`,
    'success'
  );
  haptic(18);
});

// 手动增加/修改二课成绩弹窗
document.getElementById('mcClose').addEventListener('click', closeManualCreditModal);
document.getElementById('mcCancelBtn').addEventListener('click', closeManualCreditModal);
document.getElementById('manualCreditModal').addEventListener('click', (e) => {
  if (e.target.id === 'manualCreditModal') closeManualCreditModal();
});
document.getElementById('manualCreditForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const wasEditing = Boolean(state.editingManualId);
  const moduleKey = document.getElementById('mcModule').value;
  const score = Number(document.getElementById('mcScore').value) || 0;
  await saveManualRecord({
    id: state.editingManualId,
    title: document.getElementById('mcName').value.trim(),
    moduleKey,
    score,
    eventDate: document.getElementById('mcDate').value,
    note: document.getElementById('mcNote').value.trim(),
  });
  closeManualCreditModal();
  const modName = BUCT_MODULE_MAP[moduleKey]?.name || '二课';
  showGlassToast(wasEditing ? '✓ 已更新二课成绩' : `✓ 已补录 ${modName} +${score}分`, 'success');
  haptic(14);
});

// 同步口令弹窗
document.getElementById('scClose').addEventListener('click', closeSyncCodeModal);
document.getElementById('scCancelBtn').addEventListener('click', closeSyncCodeModal);
document.getElementById('syncCodeModal').addEventListener('click', (e) => {
  if (e.target.id === 'syncCodeModal') closeSyncCodeModal();
});
document.getElementById('scCopyBtn').addEventListener('click', async () => {
  const val = document.getElementById('scExportBox').value;
  if (!val.startsWith('BUCT2K:')) return;
  try {
    await navigator.clipboard.writeText(val);
    document.getElementById('scCopyBtn').textContent = '✓ 已复制备份口令';
    showGlassToast('📋 已复制同步口令', 'success');
    haptic(10);
  } catch {
    prompt('请复制下方同步口令：', val);
  }
});
document.getElementById('scImportBtn').addEventListener('click', async () => {
  try {
    const parsed = parseSyncCodeString(document.getElementById('scImportBox').value);
    if (!state.studentUser) {
      // Auto-create/restore local account if not signed in
      const uname = String(parsed.u || 'student').trim();
      const dname = String(parsed.d || uname).trim();
      if (!state.studentBackendMode) {
        const db = readLocalAccountsDb();
        const key = uname.toLowerCase();
        db.users[key] = db.users[key] || {
          username: uname,
          display_name: dname,
          passHash: simplePassHash(uname, '123456'),
          records: [],
          createdAt: new Date().toISOString(),
        };
        writeLocalAccountsDb(db);
        setLocalActiveUsername(key);
        state.studentUser = { username: db.users[key].username, display_name: db.users[key].display_name };
        state.studentRecords = db.users[key].records || [];
      } else {
        showGlassToast('请先登录个人账号后再导入同步口令', 'warn');
        return;
      }
    }

    if (state.studentBackendMode) {
      const data = await studentApiRequest('/api/student/import', 'POST', { records: parsed.r });
      state.studentRecords = data.records || [];
    } else {
      for (const r of parsed.r) {
        if (r.activity_id != null) {
          await saveActivityRecord({
            activityId: r.activity_id,
            title: r.title,
            moduleKey: r.module_key,
            score: r.score,
            status: r.status,
            eventDate: r.event_date,
            note: r.note,
          });
        } else {
          await saveManualRecord({
            title: r.title,
            moduleKey: r.module_key,
            score: r.score,
            eventDate: r.event_date,
            note: r.note,
          });
        }
      }
    }
    updateStudentUI();
    renderFilteredLocal();
    closeSyncCodeModal();
    showGlassToast(`✓ 已成功导入 ${parsed.r.length} 条二课记录`, 'success');
  } catch (err) {
    showGlassToast(err.message || '口令解析失败', 'warn');
  }
});

// 静音提醒弹窗事件
document.getElementById('rmClose').addEventListener('click', closeRemindModal);
document.getElementById('remindModal').addEventListener('click', (e) => {
  if (e.target.id === 'remindModal') closeRemindModal();
});
document.getElementById('rmQuickWrap').addEventListener('click', (e) => {
  const btn = e.target.closest('.rm-quick-btn');
  if (!btn) return;
  document.getElementById('rmCustomTime').value = toDatetimeLocalValue(Number(btn.dataset.ms));
  document.querySelectorAll('#rmQuickWrap .rm-quick-btn').forEach((b) => b.classList.toggle('active', b === btn));
});
document.getElementById('rmSaveBtn').addEventListener('click', async () => {
  const item = state.editingRemindItem;
  if (!item) return;
  const atMs = new Date(document.getElementById('rmCustomTime').value).getTime();
  if (!Number.isFinite(atMs) || atMs <= Date.now()) {
    showGlassToast('请选择一个晚于当前时间的提醒时间', 'warn');
    return;
  }
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission().catch(() => {});
  }
  haptic(40);
  state.reminders[item.id] = {
    atMs,
    title: item.title,
    url: safeHref(item.source_article_url) || '',
    fired: false,
  };
  saveReminders();
  closeRemindModal();
  renderFilteredLocal();
  showGlassToast('🔔 已设定静音报名提醒', 'success');
});
document.getElementById('rmCancelExisting').addEventListener('click', () => {
  const item = state.editingRemindItem;
  if (!item) return;
  delete state.reminders[item.id];
  saveReminders();
  closeRemindModal();
  renderFilteredLocal();
  showGlassToast('已取消该活动提醒');
});
document.getElementById('rmIcsBtn').addEventListener('click', () => {
  const item = state.editingRemindItem;
  if (!item) return;
  const atMs = new Date(document.getElementById('rmCustomTime').value).getTime();
  downloadSilentIcs(item, Number.isFinite(atMs) ? atMs : Date.now() + 10 * 60 * 1000);
});

// 海报弹窗
document.getElementById('posterClose').addEventListener('click', closePosterModal);
document.getElementById('posterModal').addEventListener('click', (e) => {
  if (e.target.id === 'posterModal') closePosterModal();
});
document.getElementById('posterDownloadBtn').addEventListener('click', () => {
  if (!state.posterDataUrl || !state.posterItem) return;
  const a = document.createElement('a');
  a.href = state.posterDataUrl;
  a.download = `${(state.posterItem.title || 'buct-activity').replace(/[\\/:*?"<>|]/g, '').slice(0, 24)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});
document.getElementById('posterCopyBtn').addEventListener('click', async () => {
  if (!state.posterItem) return;
  const url = safeHref(state.posterItem.source_article_url) || HUB_PUBLIC_URL;
  const text = `【${state.posterItem.title}】${url}`;
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById('posterCopyBtn').textContent = '✓ 已复制链接';
    showGlassToast('🔗 已复制活动推文链接', 'success');
  } catch {
    prompt('请复制下方活动链接：', text);
  }
});

// 通用抽屉关闭 + Esc
['filterSheet', 'detailSheet', 'creditSheet'].forEach((sheetId) => {
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
  if (!document.getElementById('posterModal').classList.contains('hidden')) closePosterModal();
  else if (!document.getElementById('syncCodeModal').classList.contains('hidden')) closeSyncCodeModal();
  else if (!document.getElementById('manualCreditModal').classList.contains('hidden')) closeManualCreditModal();
  else if (!document.getElementById('attendModal').classList.contains('hidden')) closeAttendModal();
  else if (!document.getElementById('remindModal').classList.contains('hidden')) closeRemindModal();
  else if (document.getElementById('creditSheet').classList.contains('open')) closeSheet('creditSheet');
  else if (document.getElementById('detailSheet').classList.contains('open')) closeSheet('detailSheet');
  else if (document.getElementById('filterSheet').classList.contains('open')) closeSheet('filterSheet');
});

document.getElementById('refreshBtn')?.addEventListener('click', refreshAll);
document.getElementById('retryOnlineBtn')?.addEventListener('click', refreshAll);

const backTop = document.getElementById('backTop');
const syncScrollChrome = () => {
  const y = window.scrollY || 0;
  backTop.classList.toggle('show', y > 500);
  document.body.classList.toggle('is-scrolled', y > 16);
};
window.addEventListener('scroll', syncScrollChrome, { passive: true });
syncScrollChrome();
backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

let resizePillTimer = null;
window.addEventListener(
  'resize',
  () => {
    clearTimeout(resizePillTimer);
    resizePillTimer = setTimeout(() => syncAllLiquidTracks(true), 80);
  },
  { passive: true }
);
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => syncAllLiquidTracks(true)).catch(() => {});
}

/* ==================== 启动与定时器 ==================== */
syncThemeToggleIcon();
updateUiStyleUI(true);
loadReminders();
syncFilterControlsUI();
initStudentSession();

const initialCached = loadSnapshotFromCache();
if (initialCached) {
  state.meta = initialCached.meta;
  state.allItems = initialCached.allItems;
  state.lastSyncedAt = initialCached.cachedAt;
  applyMetaToDom();
  updateStudentUI();
  renderFilteredLocal();
}

refreshAll();

// 每秒更新倒计时胶囊 & 检查到点静音提醒
setInterval(() => {
  for (const item of state.allItems) {
    const pillEls = document.querySelectorAll(`[data-reg-pill="${item.id}"]`);
    if (!pillEls.length) continue;
    const st = getRegistrationStatus(item);
    pillEls.forEach((el) => {
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
