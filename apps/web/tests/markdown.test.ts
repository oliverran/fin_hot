// Links in the site's own copy (terms, privacy): the site's own address stays on the site, whatever
// domain it is deployed at; any other address opens in a new tab.
import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "cheerio";
import { readFileSync } from "node:fs";
import { parseCopyFile, renderMarkdown } from "../app/lib/markdown.ts";

const SITE = "https://news.example.com";
const link = (md: string) => /<a [^>]*>/.exec(renderMarkdown(md, SITE).html)?.[0];

test("a link to the site's own address becomes an in-site path", () => {
  assert.equal(link("[关于](https://news.example.com/about)"), '<a href="/about">');
  assert.equal(link("[首页](https://news.example.com)"), '<a href="/">');
  assert.equal(link("[隐私](/privacy)"), '<a href="/privacy">');
});

test("any other address opens in a new tab", () => {
  assert.equal(link("[别处](https://other.example.org/about)"), '<a href="https://other.example.org/about" target="_blank" rel="noopener noreferrer">');
  assert.equal(link("[别的站](https://news.example.com.evil.test/about)"), '<a href="https://news.example.com.evil.test/about" target="_blank" rel="noopener noreferrer">');
});

test("both offline mobile policies contain the website's current metadata, introduction, sections and links", () => {
  const resources = JSON.parse(readFileSync(new URL("../../mobile-resources/policies.json", import.meta.url), "utf8"));
  for (const name of ["terms", "privacy"]) {
    const source = readFileSync(new URL("../../../site/pages/" + name + ".md", import.meta.url), "utf8");
    const { title, meta, intro, body } = parseCopyFile(source);
    const document = resources[name];
    assert.equal(document.title, title);
    assert.deepEqual(document.metadata, Object.entries(meta).map(([label, value]) => ({ label, value })));
    assert.equal(document.intro, intro);
    const rendered = renderMarkdown(body, "");
    assert.deepEqual(document.sections.map((s: { heading: string }) => s.heading), rendered.outline.map((h) => h.text));
    const $ = load(rendered.html);
    type Run = { text: string; url?: string };
    const paragraphs: Run[][] = document.sections.flatMap((s: { paragraphs: Run[][] }) => s.paragraphs);
    assert.deepEqual(paragraphs.map((p) => p.map((r) => r.text).join("")), $("p").toArray().map((p) => $(p).text()));
    assert.deepEqual(paragraphs.flat().filter((r) => r.url), $("p a").toArray().map((a) => ({ text: $(a).text(), url: $(a).attr("href") })));
  }
});
