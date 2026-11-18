import { defineWebModule } from "@aihot/web/modules";
import { IconDownload } from "../../apps/web/app/components/icons";

export default defineWebModule({
  name: "mobile-download",
  sidebar: { section: "应用", items: [{ to: "/download", label: "下载 App", icon: IconDownload }] },
  tools: [{ to: "/download", label: "下载 App", icon: <IconDownload size={20} /> }],
});
