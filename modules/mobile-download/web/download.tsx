import { Link, redirect, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { IOS_DOWNLOAD_URL, SITE } from "@aihot/site";
import { pageMeta } from "../../../apps/web/app/lib/seo";
import iosCode from "./ios.png";
import androidCode from "./android.png";

// Only the signed release artifact is staged here by the operator before the web build.
const apks = import.meta.glob<string>("./release/FinHOT.apk", { eager: true, query: "?url", import: "default" });
const platforms = {
  ios: { name: "iOS", system: "iPhone 和 iPad · iOS 17 及以上", code: iosCode, url: IOS_DOWNLOAD_URL },
  android: { name: "Android", system: "Android 8.0 及以上", code: androidCode, url: apks["./release/FinHOT.apk"] ?? null },
};

export const handle = { tab: "me", name: "下载 App" };
export function loader({ params }: LoaderFunctionArgs) {
  const platform = params.platform;
  if (platform === undefined) return null;
  if (platform !== "android" && platform !== "ios") throw new Response(null, { status: 404 });
  const url = platforms[platform].url;
  if (url) throw redirect(url, { headers: { "Cache-Control": "no-store" } });
  return platform;
}
export function meta() { return pageMeta({ title: "下载 App", path: "/download" }); }
export default function DownloadPage() {
  const platform = useLoaderData<typeof loader>();
  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="mb-6 text-3xl font-bold text-ink">{SITE.name} {platform ? platforms[platform].name : "App 下载"}</h1>
      {platform ? <><p>此平台的下载暂未开放。</p><Link to="/download" className="mt-5 inline-block underline">查看各平台下载</Link></> :
        <div className="grid gap-5 sm:grid-cols-2">
          {(["ios", "android"] as const).map(key => {
            const info = platforms[key];
            return <section key={key} className="card flex flex-col items-center gap-3 p-6 text-center">
              <h2 className="text-2xl font-semibold">{info.name}</h2>
              <p className="text-sm text-ink-3">{info.system}</p>
              <img src={info.code} width={185} height={185} alt={info.name + " 专属下载二维码"} />
              <a className="font-semibold underline" href={"/download/" + key}>
                {info.url ? (key === "android" ? "下载正式 APK" : "打开 iOS 下载") : "查看开放状态"}
              </a>
              {!info.url && <p className="text-sm text-ink-3">暂未开放下载</p>}
            </section>;
          })}
        </div>}
    </main>
  );
}
