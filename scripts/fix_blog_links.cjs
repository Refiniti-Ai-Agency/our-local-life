/*
 * Fix the blog index (Nov 2026).
 *
 * Problem: every card on /pages/blog/index.html pointed at /pages/blog/meet-*.html
 * pages that were never built (404), and new interviews (e.g. Tymbrea Mattox)
 * never showed up on the blog because the blog list was hand-maintained.
 *
 * What this does (safe to run more than once):
 *   1. In every built bundle (assets/main-*.js), replaces the hard-coded blog list
 *      with one generated from the curated-stories list, so every interview gets a
 *      blog card that links to its real story page.
 *   2. Adds any story page in /pages/stories/ that is missing from the stories list
 *      (e.g. Tymbrea), reading its title/description/image from the page itself.
 *   3. Adds 301 redirects for the old dead blog URLs to firebase.json.
 *   4. Points sitemap.xml at the real story URLs.
 *
 * Usage (from the repo root, AFTER syncing the live site into the repo):
 *   node scripts/fix_blog_links.cjs
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const SITE = "https://ourlocallife.com";

// Old blog URL slug -> real story page
const DEAD = {
  "meet-atma-erice-the-practice-of-presence":
    "/pages/stories/the-practice-of-presence-inside-atmas-approach-to-healing.html",
  "meet-dustin-defrates-builder-of-people-places-purpose":
    "/pages/stories/dustin-defrates-building-people-places-purpose.html",
  "meet-lai-lam-intentional-dating-resumate":
    "/pages/stories/intentional-dating-resumate-lai-lam.html",
  "restoring-the-soil-with-kat-cat":
    "/pages/stories/restoring-the-soil-with-christina-kat-cat.html",
  "meet-demarius-parker-linking-the-body":
    "/pages/stories/linking-the-body-demarius-parker.html",
  "meet-chris-wuehr-mind-body-connection":
    "/pages/stories/meet-chris-wuehr-mind-body-connection.html",
};

// Category hints for stories we add automatically (default: community)
const CATEGORY = {
  "tymbrea-mattox-the-power-of-perspective": "community",
};
const DATE = {
  "tymbrea-mattox-the-power-of-perspective": "2026-11-11",
};

const log = (...a) => console.log("•", ...a);

// ---------- helpers ----------
function matchBracket(s, open) {
  // s[open] === '['; returns index of matching ']' (skips strings/templates)
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < s.length && s[i] !== q) {
        if (s[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function enclosingArray(s, idx) {
  // walk back from idx to the '[' that opens the array containing idx
  let depth = 0;
  for (let i = idx; i >= 0; i--) {
    const c = s[i];
    if (c === "]" || c === "}") depth++;
    else if (c === "[" || c === "{") {
      if (depth === 0 && c === "[") return i;
      if (depth > 0) depth--;
    }
  }
  return -1;
}

function metaFromPage(file) {
  const html = fs.readFileSync(file, "utf8");
  const pick = (re) => {
    const m = html.match(re);
    return m ? m[1].trim() : "";
  };
  const decode = (t) =>
    t
      .replace(/&amp;/g, "&")
      .replace(/&#39;|&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&rsquo;/g, "’");
  let title =
    pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) ||
    pick(/<title>([^<]+)<\/title>/i);
  title = decode(title.replace(/\s*[|–-]\s*Our Local Life.*$/i, ""));
  const description = decode(
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) ||
      pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i)
  );
  let image = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
  image = image.replace(/^https?:\/\/[^/]+/, "");
  return { title, description, image };
}

// ---------- 1 + 2: bundles ----------
const storyDir = path.join(root, "pages/stories");
const storyFiles = fs.existsSync(storyDir)
  ? fs.readdirSync(storyDir).filter((f) => f.endsWith(".html"))
  : [];

const bundles = fs
  .readdirSync(path.join(root, "assets"))
  .filter((f) => /^main-.*\.js$/.test(f));

for (const b of bundles) {
  const p = path.join(root, "assets", b);
  let s = fs.readFileSync(p, "utf8");

  // stories array: the one holding the Demarius story entry
  const sIdx = s.indexOf('id:"linking-the-body-demarius-parker"');
  if (sIdx === -1) {
    log(b, "— no stories list found, skipped");
    continue;
  }
  const sOpen = enclosingArray(s, sIdx);
  const nameMatch = s.slice(Math.max(0, sOpen - 20), sOpen).match(/([A-Za-z_$][\w$]*)=$/);
  if (!nameMatch) {
    log(b, "— could not name stories list, skipped");
    continue;
  }
  const storiesVar = nameMatch[1];
  let sClose = matchBracket(s, sOpen);
  let storiesSrc = s.slice(sOpen, sClose + 1);

  // add missing story pages
  const additions = [];
  for (const f of storyFiles) {
    const url = `/pages/stories/${f}`;
    if (storiesSrc.includes(url)) continue;
    const id = f.replace(/\.html$/, "");
    const meta = metaFromPage(path.join(storyDir, f));
    if (!meta.title) continue;
    const cat = CATEGORY[id] || "community";
    const entry = {
      id,
      title: meta.title,
      description: meta.description,
      image: meta.image,
      url,
      category: cat,
      label: cat[0].toUpperCase() + cat.slice(1),
      cta: "Read story",
      date: DATE[id] || new Date().toISOString().slice(0, 10),
    };
    additions.push(entry);
  }
  if (additions.length) {
    const lit = additions
      .map(
        (e) =>
          "{" +
          Object.entries(e)
            .map(([k, v]) => `${k}:${JSON.stringify(v)}`)
            .join(",") +
          "}"
      )
      .join(",");
    s = s.slice(0, sOpen + 1) + lit + "," + s.slice(sOpen + 1);
    log(b, "— added stories:", additions.map((a) => a.id).join(", "));
    sClose = matchBracket(s, sOpen);
  }

  // blog array: the one holding blog-demarius-body (skip if already generated)
  const bIdx = s.indexOf('id:"blog-demarius-body"');
  if (bIdx === -1) {
    log(b, "— blog list already generated or not present");
  } else {
    const bOpen = enclosingArray(s, bIdx);
    const bName = s.slice(Math.max(0, bOpen - 20), bOpen).match(/([A-Za-z_$][\w$]*)=$/);
    const bClose = matchBracket(s, bOpen);
    const oldBlog = s.slice(bOpen, bClose + 1);
    // keep the hand-written blog descriptions, keyed by story URL
    const descs = {};
    const re = /description:"((?:[^"\\]|\\.)*)"[^}]*?storyUrl:"([^"]+)"/g;
    let m;
    while ((m = re.exec(oldBlog))) descs[m[2]] = JSON.parse('"' + m[1] + '"');
    const gen =
      `${storiesVar}.filter(s=>s&&s.url&&!s.placeholder).map(s=>({id:"blog-"+s.id,title:s.title,` +
      `description:(${JSON.stringify(descs)})[s.url]||s.description,image:s.image,url:s.url,storyUrl:s.url,date:s.date}))` +
      `.sort((a,b)=>(b.date||"").localeCompare(a.date||""))`;
    s = s.slice(0, bOpen) + gen + s.slice(bClose + 1);
    log(b, `— blog list (${bName && bName[1]}) now generated from stories (${storiesVar})`);
  }

  // any leftover hard-coded dead links
  for (const [slug, story] of Object.entries(DEAD)) {
    s = s.split(`/pages/blog/${slug}.html`).join(story);
  }
  fs.writeFileSync(p, s);
}

// content.js source of truth: add missing stories there too
const contentPath = path.join(root, "assets/data/content.js");
if (fs.existsSync(contentPath)) {
  let c = fs.readFileSync(contentPath, "utf8");
  const marker = "export const curatedStories = [";
  if (c.includes(marker)) {
    const adds = storyFiles
      .filter((f) => !c.includes(`/pages/stories/${f}`))
      .map((f) => {
        const id = f.replace(/\.html$/, "");
        const meta = metaFromPage(path.join(storyDir, f));
        const cat = CATEGORY[id] || "community";
        return `  {\n    id: ${JSON.stringify(id)},\n    title: ${JSON.stringify(meta.title)},\n    description: ${JSON.stringify(meta.description)},\n    image: ${JSON.stringify(meta.image)},\n    url: ${JSON.stringify("/pages/stories/" + f)},\n    category: ${JSON.stringify(cat)},\n    label: ${JSON.stringify(cat[0].toUpperCase() + cat.slice(1))},\n    cta: "Read story",\n    date: ${JSON.stringify(DATE[id] || new Date().toISOString().slice(0, 10))},\n  },`;
      });
    if (adds.length) {
      c = c.replace(marker, marker + "\n" + adds.join("\n"));
      fs.writeFileSync(contentPath, c);
      log("content.js — added", adds.length, "stories");
    }
  }
}

// ---------- 3: firebase.json redirects ----------
const fbPath = path.join(root, "firebase.json");
const fb = JSON.parse(fs.readFileSync(fbPath, "utf8"));
fb.hosting.redirects = fb.hosting.redirects || [];
const have = new Set(fb.hosting.redirects.map((r) => r.source));
for (const [slug, story] of Object.entries(DEAD)) {
  for (const source of [`/pages/blog/${slug}.html`, `/blog/${slug}`]) {
    if (!have.has(source)) fb.hosting.redirects.push({ source, destination: story, type: 301 });
  }
}
fs.writeFileSync(fbPath, JSON.stringify(fb, null, 2) + "\n");
log("firebase.json — redirects for old blog URLs in place");

// ---------- 4: sitemap ----------
const smPath = path.join(root, "sitemap.xml");
if (fs.existsSync(smPath)) {
  let sm = fs.readFileSync(smPath, "utf8");
  // drop dead blog entries
  for (const slug of Object.keys(DEAD)) {
    sm = sm.replace(
      new RegExp(`\\s*<url>\\s*<loc>${SITE.replace(/\./g, "\\.")}/blog/${slug}</loc>[\\s\\S]*?</url>`, "g"),
      ""
    );
  }
  // the sitemap used pretty URLs (/stories/x, /about) but the site has no
  // cleanUrls, so point each <loc> at the real file when one exists
  sm = sm.replace(/<loc>([^<]+)<\/loc>/g, (whole, loc) => {
    if (!loc.startsWith(SITE)) return whole;
    const p = loc.slice(SITE.length).replace(/^\/+/, "").replace(/\/+$/, "");
    if (!p || p.endsWith(".html") || p === "hub") return whole;
    const tries = [`${p}.html`, `pages/${p}.html`, `${p}/index.html`, `pages/${p}/index.html`];
    const hit = tries.find((t) => fs.existsSync(path.join(root, t)));
    return hit ? `<loc>${SITE}/${hit}</loc>` : whole;
  });
  // make sure every story page is listed
  const adds = storyFiles
    .map((f) => `${SITE}/pages/stories/${f}`)
    .filter((u) => !sm.includes(u));
  if (adds.length) {
    const block = adds
      .map((u) => `  <url>\n    <loc>${u}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`)
      .join("\n");
    sm = sm.replace("</urlset>", block + "\n</urlset>");
  }
  fs.writeFileSync(smPath, sm);
  log("sitemap.xml — dead blog URLs removed;", adds.length, "story URLs added");
}

console.log("\nDone. Preview with:  npx firebase-tools serve --only hosting");
