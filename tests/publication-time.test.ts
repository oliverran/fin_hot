// An item whose original carries no reliable date keeps its public page, and no exit presents when it was
// collected as when it was published. Failure cases: the Markdown export labels the collection time
// "发布时间"; RSS gives the collection time as pubDate; a dated item loses its publication time.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { chronicleNews } from "@aihot/backend/publication/chronicle";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const SOURCE = `pubtime-${T}`;
const discovered = new Date(Date.now() - 3600_000);
const published = new Date(Date.now() - 5 * 3600_000);
const ids = { dated: `${T}-dated`, undated: `${T}-undated` };
const app = await buildApp();

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier) VALUES (${SOURCE}, 'Publication time fixture', 'rss', 'T1')`;
  for (const [kind, id] of Object.entries(ids)) {
    const at = kind === "dated" ? published : null;
    await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at, published_at)
      VALUES (${id}, ${SOURCE}, ${id}, ${`https://example.org/${id}`}, ${`${T} ${kind}`}, ${discovered}, ${discovered}, ${at})`;
    await sql`INSERT INTO publications (article_id, title, source_id, channel, url, discovered_at, timeline_at, published_at, sort_at,
        eligible, selected, visible_after, visibility, tags, summary)
      VALUES (${id}, ${`${T} ${kind}`}, ${SOURCE}, 'news', ${`https://example.org/${id}`}, ${discovered}, ${discovered}, ${at}, ${discovered},
        true, false, ${discovered}, 'public', ${[T]}, 'fixture summary')`;
  }
});
after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

const get = async (url: string) => {
  const res = await app.inject({ method: "GET", url });
  assert.equal(res.statusCode, 200, url);
  return res.body;
};

test("the Markdown export names the collection time as such when the publication time is unknown", async () => {
  const undated = await get(`/items/${ids.undated}/markdown`);
  assert.ok(undated.includes(`- 收录时间：${discovered.toISOString()}`));
  assert.ok(!undated.includes("发布时间"));
  assert.ok((await get(`/items/${ids.dated}/markdown`)).includes(`- 发布时间：${published.toISOString()}`));
});

test("RSS gives no pubDate for an item without a known publication time", async () => {
  const feed = await get("/feed/all.xml");
  const entry = (id: string) => feed.split("<item>").find((block) => block.includes(`>${id}</guid>`));
  assert.ok(entry(ids.undated) && !entry(ids.undated)!.includes("<pubDate>"));
  assert.ok(entry(ids.dated)!.includes(`<pubDate>${published.toUTCString()}</pubDate>`));
});

test("chronicle news keeps Beijing calendar boundaries and public selected visibility", async () => {
  const fixtures = [
    { name: "before", at: "2024-02-28T15:59:59.999Z" },
    { name: "start", at: "2024-02-28T16:00:00.000Z" },
    { name: "last", at: "2024-02-29T15:59:59.999Z" },
    { name: "after", at: "2024-02-29T16:00:00.000Z" },
    { name: "unselected", at: "2024-02-29T00:00:00.000Z", selected: false },
    { name: "unseated", at: "2024-02-29T00:00:00.000Z", seat: false },
    { name: "withdrawn", at: "2024-02-29T00:00:00.000Z", visibility: "withdrawn" },
    { name: "unreleased", at: "2024-02-29T00:00:00.000Z", release: "2100-01-01T00:00:00Z" },
  ];
  for (const fixture of fixtures) {
    const id = `${T}-chronicle-${fixture.name}`;
    const at = new Date(fixture.at);
    const url = `https://example.org/${id}`;
    await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at, published_at)
      VALUES (${id}, ${SOURCE}, ${id}, ${url}, ${id}, ${at}, ${at}, ${at})`;
    await sql`INSERT INTO publications (article_id, title, source_id, channel, url, discovered_at, timeline_at, published_at, sort_at,
        eligible, selected, seat, visible_after, visibility, tags, summary)
      VALUES (${id}, ${id}, ${SOURCE}, 'news', ${url}, ${at}, ${at}, ${at}, ${at},
        true, ${fixture.selected ?? true}, ${fixture.seat ?? true}, ${new Date(fixture.release ?? fixture.at)},
        ${fixture.visibility ?? "public"}, ${[T]}, 'fixture summary')`;
  }
  const news = await chronicleNews("2024-02-29", "2024-02-29");
  assert.deepEqual(news.map(({ id, date }) => ({ id, date })), [
    { id: `${T}-chronicle-last`, date: "2024-02-29" },
    { id: `${T}-chronicle-start`, date: "2024-02-29" },
  ]);
});
