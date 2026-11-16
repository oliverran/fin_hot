// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";
import chronicle from "@aihot/chronicle/web";
import analytics from "@aihot/analytics/web";
import quant from "@aihot/quant/web";

export const WEB_MODULES: readonly WebModule[] = [chronicle, analytics, quant];
