import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "mobile-download",
  pages: [
    { path: "download", file: "web/download.tsx", id: "mobile-download" },
    { path: "download/:platform", file: "web/download.tsx", id: "mobile-platform-download" },
  ],
});
