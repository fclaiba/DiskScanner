#!/usr/bin/env node
// Measures initial JS (gzip) per route of a running server:
//   node scripts/measure-js.mjs http://localhost:3000 / /pricing /download
import { gzipSync } from "node:zlib";

const [base = "http://localhost:3000", ...routes] = process.argv.slice(2);
const list = routes.length ? routes : ["/", "/pricing", "/download", "/legal/terms", "/login", "/signup"];
const cache = new Map();
async function gz(url) {
  if (!cache.has(url)) {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    cache.set(url, gzipSync(buf, { level: 9 }).length);
  }
  return cache.get(url);
}
for (const r of list) {
  const html = await (await fetch(base + r)).text();
  // Skip `noModule` polyfills: modern browsers never download them.
  const srcs = [...new Set([...html.matchAll(/<script([^>]*)src="([^"]+)"[^>]*>/g)].filter((m) => !/nomodule/i.test(m[0])).map((m) => m[2]))];
  let total = 0;
  for (const s of srcs) total += await gz(new URL(s, base).toString());
  const inline = gzipSync(Buffer.from([...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join(""))).length;
  console.log(`${r.padEnd(16)} ${String(srcs.length).padStart(2)} files  ${(total / 1024).toFixed(1).padStart(6)} KB gz  (+${(inline / 1024).toFixed(1)} KB gz inline RSC payload)`);
}
