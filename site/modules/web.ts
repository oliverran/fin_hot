// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";
import chronicle from "@aihot/chronicle/web";
import analytics from "@aihot/analytics/web";
import opportunities from "@aihot/opportunities/web";
import modelEval from "@aihot/model-eval/web";

import mobileDownload from "../../modules/mobile-download/web.tsx";

export const WEB_MODULES: readonly WebModule[] = [chronicle, analytics, opportunities, modelEval, mobileDownload];
