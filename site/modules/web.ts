// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";
import chronicle from "@aihot/chronicle/web";

export const WEB_MODULES: readonly WebModule[] = [chronicle];
