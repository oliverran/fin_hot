// The backend of the site's modules, installed by the api and the worker when they start (site/modules/index.ts).
import type { ServerModule } from "@aihot/backend/modules";
import chronicle from "@aihot/chronicle/server";
import analytics from "@aihot/analytics/server";
import costs from "@aihot/costs/server";

export const SERVER_MODULES: readonly ServerModule[] = [chronicle, analytics, costs];
