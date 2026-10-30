// Path-based routing shim for the ported chronicle app.
//
// The original site is path-addressed, and the ported bundle is not: it keeps
// its whole UI state (locale + activeTab) in an external store, seeded from
// localStorage["us-panel-prefs"] (schema 4), and navigates purely client-side.
//
// Address shapes we mirror (see the original `de` locale map):
//
//   /                        front page, English          (en has no prefix)
//   /zh-cn/                  front page, 简体
//   /zh-tw/  /ja/  /es/  /ko/  /fr/  /de/                 other locales
//   /sp500/  /zh-cn/sp500/   a volume                     (tab)
//   /zh-cn/sp500/annual/     a volume at one panel        (tab + #panel-<id>)
//
// Tab `cross` is the Nasdaq volume — its path segment is `nasdaq`.
//
// So: translate the URL into the prefs record *before* the bundle boots, and
// afterwards mirror tab/locale changes back into the address bar.
//
// FinHOT mounts this app under a base path (`/us-market/`, see vite.config.js), so every generated
// address carries ROOT and every root-relative `/api/*` request has it prepended.

const PREFS_KEY = "us-panel-prefs";
const SCHEMA = 4;

/** Where the app is mounted: "" at the site root, "/us-market" on FinHOT (Vite's base, no trailing slash). */
const ROOT = import.meta.env.BASE_URL.replace(/\/+$/, "");

const TABS = [
  "overview",
  "sp500",
  "cross",
  "semi",
  "xlk",
  "fin",
  "consumer",
  "mag7",
  "dynasties",
  "latest",
];
const LOCALES = ["cn", "tw", "en", "ja", "es", "ko", "fr", "de"];
const THEMES = ["light", "dark"];

/** locale -> URL prefix (verbatim from the original bundle). */
const LOCALE_PREFIX = { cn: "/zh-cn", tw: "/zh-tw", en: "", ja: "/ja", es: "/es", ko: "/ko", fr: "/fr", de: "/de" };
/** first path segment -> locale. `/en/` is accepted even though the bundle
 *  emits an empty prefix for English (the original links to both). */
const SEGMENT_LOCALE = { "zh-cn": "cn", "zh-tw": "tw", en: "en", ja: "ja", es: "es", ko: "ko", fr: "fr", de: "de" };

/** tab -> volume path segment. */
const TAB_SEGMENT = {
  overview: "",
  sp500: "sp500",
  cross: "nasdaq",
  semi: "semi",
  xlk: "xlk",
  fin: "fin",
  consumer: "consumer",
  mag7: "mag7",
  dynasties: "dynasties",
  latest: "latest",
};
/** volume path segment -> tab. */
const SEGMENT_TAB = Object.fromEntries(Object.entries(TAB_SEGMENT).map(([t, s]) => [s, t]));

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

/**
 * Split `location.pathname` into { locale, tab, panel }.
 * Returns null when the path carries no routing information (e.g. `/`).
 */
function parsePath() {
  let segs;
  const path = ROOT && location.pathname.startsWith(ROOT) ? location.pathname.slice(ROOT.length) : location.pathname;
  try {
    segs = decodeURIComponent(path).split("/").filter(Boolean);
  } catch {
    return null;
  }
  if (!segs.length) return null;

  let locale = "en";
  let i = 0;
  if (SEGMENT_LOCALE[segs[0]]) {
    locale = SEGMENT_LOCALE[segs[0]];
    i = 1;
  }

  const volume = segs[i];
  const panel = segs[i + 1];
  if (!volume) return { locale, tab: "overview", panel: null };

  const tab = SEGMENT_TAB[volume];
  if (!tab) return null; // unknown path (articles, static assets, …)

  return { locale, tab, panel: panel || null };
}

/** Seed the store from the URL. Runs before the bundle is imported. */
function bootFromPath() {
  const r = parsePath();
  if (!r) return;

  const prev = readPrefs();
  const next = {
    locale: r.locale,
    theme: THEMES.includes(prev.theme) ? prev.theme : "light",
    activeTab: TABS.includes(r.tab) ? r.tab : "overview",
    readingMode: false,
    railHidden: false,
    _schema: SCHEMA,
  };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* private mode — the bundle falls back to navigator.language */
  }

  // Panel deep-link: the bundle eagerly mounts the section whose id is
  // `panel-<id>` when the hash already matches at mount time (see `Ve`).
  if (r.panel && location.hash !== `#panel-${r.panel}`) {
    history.replaceState(history.state, "", `${location.pathname}${location.search}#panel-${r.panel}`);
  }
}

/** Mirror the store back into the address bar (tab + locale only). */
function syncPathToPrefs(prefs) {
  if (!prefs || typeof prefs !== "object") return;
  const locale = LOCALES.includes(prefs.locale) ? prefs.locale : "en";
  const tab = TABS.includes(prefs.activeTab) ? prefs.activeTab : "overview";
  const prefix = LOCALE_PREFIX[locale] ?? "";
  const segment = TAB_SEGMENT[tab] ?? "";
  const want = segment ? `${ROOT}${prefix}/${segment}/` : `${ROOT}${prefix}/`;
  if (location.pathname !== want) {
    history.replaceState(history.state, "", `${want}${location.search}${location.hash}`);
  }
}

function observePrefs() {
  // The bundle persists every state change through `localStorage.setItem`,
  // so snooping that call is the one reliable way to read tab/locale without
  // reaching into its private store.
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function setItem(key, value) {
    const out = original.apply(this, arguments);
    if (key === PREFS_KEY) {
      try {
        syncPathToPrefs(JSON.parse(value));
      } catch {
        /* ignore malformed writes */
      }
    }
    return out;
  };
}

/**
 * The ported bundle writes its data requests as root-relative `/api/*` (and builds them in a hundred
 * places), so rather than patch each one, prepend the mount base to every such request here.
 */
function mountDataRequests() {
  if (!ROOT) return;
  const original = window.fetch;
  window.fetch = function fetch(input, init) {
    if (typeof input === "string" && input.startsWith("/api/")) input = ROOT + input;
    return original.call(this, input, init);
  };
}

mountDataRequests();
bootFromPath();
observePrefs();
