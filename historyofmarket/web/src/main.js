// Entry point of the local clone.
//
// Load order matters:
//   0. router.js          — translates the address bar (the original site is
//                           path-addressed: /zh-cn/sp500/annual/) into the
//                           bundle's prefs record, and mirrors tab/locale
//                           changes back. Must run before the bundle boots.
//   1. hom.css            — the compiled Tailwind v4 stylesheet lifted from the
//                           original build (design tokens, @font-face, every
//                           component + utility class the bundle uses).
//   2. hom/main.js        — the ported application shell. It imports its own
//                           vendored React (vendor-react.js) and, as a side
//                           effect, mounts the whole chronicle app into #root.
//                           It also side-effect-imports all 8 i18n locales.
//
// We intentionally do NOT import npm `react` here: the ported bundle ships and
// uses its own React 19.2.5 instance, and two React instances would break hooks.
import "./router.js";
import "./styles/hom.css";
import "./hom/main.js";
