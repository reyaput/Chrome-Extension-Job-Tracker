// Real DOM regression fixtures, without npm dependencies or spreadsheet writes.
// Run: node tests/browser-fixtures.cjs, then open http://127.0.0.1:8765.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const content = fs.readFileSync(path.join(root, "extension/content.js"), "utf8");
const background = fs.readFileSync(path.join(root, "extension/background.js"), "utf8");
const kalibrrBody = `<section itemscope itemtype="https://schema.org/JobPosting">
  <div><h1 itemprop="title">Account Support Coordinator Bandung</h1>
    <a href="/c/example/jobs"><h2>Example Recruitment</h2></a>
    <ul><li><span itemscope itemtype="https://schema.org/PostalAddress">Bandung, Indonesia</span></li>
      <li><span>IDR 4,600,000</span><span> - IDR 4,700,000</span><span> / month</span>
        <div hidden itemprop="baseSalary"><span itemprop="minValue">4600000</span></div></li>
      <li>Full time</li></ul></div>
  <div hidden itemprop="hiringOrganization"><meta itemprop="name" content="Example Recruitment"></div>
  <div hidden itemprop="jobLocation"><div itemprop="address">
    <span itemprop="addressLocality">Bandung</span><span itemprop="addressRegion">West Java</span>
    <span itemprop="addressCountry">Indonesia</span></div></div>
  <span hidden itemprop="validThrough">2026-10-22T17:00:00+00:00</span>
  <h2>Job Description</h2><div itemprop="description"><ul><li>Coordinate accounts.</li><li>Prepare reports.</li></ul></div>
</section><aside><h1>Wrong recommended role</h1><div itemprop="description">Wrong recommendation text</div></aside>`;
const kalibrrExpected = { nama_pekerjaan: "Account Support Coordinator Bandung", perusahaan: "Example Recruitment",
  lokasi: "Bandung, West Java, Indonesia", range_gaji: "IDR 4,600,000 - IDR 4,700,000 / month",
  deadline: "2026-10-22", tipe_kerja: "", deskripsi: "Coordinate accounts. Prepare reports." };
const currentPost = "Example Health Indonesia is still looking for professionals to join our growing team in Bekasi!\n\n" +
  "📌 Available Positions:\nClinic Manager\nNurse\n\nApplication Deadline: Oct 31, 2026";
const postExpected = { nama_pekerjaan: "Clinic Manager; Nurse", perusahaan: "Example Health Indonesia", lokasi: "Bekasi",
  deadline: "2026-10-31", tipe_kerja: "", range_gaji: "", deskripsi: currentPost.replace(/\s+/g, " ") };
const cases = [
  { name: "Kalibrr microdata, visible salary, and scoped description", url: "https://jobseeker.kalibrr.com/c/example/jobs/123/example",
    title: "Kalibrr: Where Jobs Find You", body: kalibrrBody, expected: kalibrrExpected },
  { name: "Kalibrr waits for delayed SPA rendering", url: "https://www.kalibrr.com/c/example/jobs/123/example",
    title: "Kalibrr: Where Jobs Find You", body: "<nav>Kalibrr</nav>", delayedBody: kalibrrBody, expected: kalibrrExpected },
  { name: "LinkedIn share permalink excludes the old reshared deadline", url: "https://www.linkedin.com/posts/example-share-333-test/",
    title: "Posting | LinkedIn", body: `<main id="main-content"><article class="main-feed-activity-card"
      data-activity-urn="urn:li:activity:444" data-attributed-urn="urn:li:share:333">
      <p data-test-id="main-feed-activity-card__commentary">${currentPost}</p>
      <article class="feed-reshare-content" aria-label="Reshared post"><p class="update-components-text">
      Position: Wrong old role\nCompany: Wrong old employer\nApplication Deadline: 31 August 2026</p></article>
      <div class="comments">Position: Wrong comment role</div></article></main>`, expected: postExpected },
  { name: "LinkedIn feed permalink selects matching card rather than another post", url: "https://www.linkedin.com/feed/update/urn:li:activity:444/",
    title: "Posting | LinkedIn", body: `<article class="feed-shared-update-v2" data-urn="urn:li:activity:111">
      <div class="update-components-text">Position: Wrong recommended role</div></article>
      <article class="feed-shared-update-v2" data-urn="urn:li:activity:444"><div class="update-components-text">${currentPost}</div>
      <div class="feed-shared-mini-update-v2"><div class="update-components-text">Position: Wrong quote</div></div></article>`, expected: postExpected },
  { name: "LinkedIn SocialMediaPosting body excludes sharedContent and comments", url: "https://www.linkedin.com/posts/example-activity-444-test/",
    title: "Posting | LinkedIn", body: "<nav>LinkedIn</nav>", structured: { "@type": "SocialMediaPosting",
      "@id": "https://www.linkedin.com/posts/example-activity-444-test/", articleBody: currentPost,
      sharedContent: { "@type": "SocialMediaPosting", articleBody: "Position: Wrong old role\nApplication Deadline: 31 August 2026" },
      comment: [{ "@type": "SocialMediaPosting", articleBody: "Position: Wrong comment role" }] }, expected: postExpected },
  { name: "Unrelated feed cards cannot supply a post body", url: "https://www.linkedin.com/feed/update/urn:li:activity:444/",
    title: "Posting | LinkedIn", body: `<article class="feed-shared-update-v2" data-urn="urn:li:activity:111">
      <div class="update-components-text">Position: Wrong role 1</div></article><article class="feed-shared-update-v2" data-urn="urn:li:activity:222">
      <div class="update-components-text">Position: Wrong role 2</div></article>`, expectedError: "Teks posting LinkedIn belum terbaca" },
  { name: "A single card with the wrong post ID is also rejected", url: "https://www.linkedin.com/feed/update/urn:li:activity:444/",
    title: "Posting | LinkedIn", body: `<article class="feed-shared-update-v2" data-urn="urn:li:activity:111">
      <div class="update-components-text">Position: Wrong role</div></article>`, expectedError: "Teks posting LinkedIn belum terbaca" },
  { name: "Structured Glints extraction still works and strips HTML", url: "https://glints.com/jobs/example",
    title: "Glints", body: "<main>Data Analyst</main>", structured: { "@graph": [{ "@type": "JobPosting",
      title: "Data Analyst", hiringOrganization: { name: "Example Analytics" }, description: "<p>Analyze data.</p><p>Use SQL.</p>" }] },
    expected: { nama_pekerjaan: "Data Analyst", perusahaan: "Example Analytics", deskripsi: "Analyze data. Use SQL." } },
  { name: "Platform-only Kalibrr metadata produces no job title", url: "https://jobseeker.kalibrr.com/c/example/jobs/123/example",
    title: "Kalibrr: Where Jobs Find You", body: "<nav>Kalibrr</nav>", expected: { nama_pekerjaan: "", perusahaan: "", deskripsi: "" } }
];
const scriptLiteral = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const server = http.createServer((request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  const index = request.url.match(/^\/case\/(\d+)$/)?.[1];
  if (index !== undefined && cases[index]) {
    const fixture = cases[index];
    response.end(`<!doctype html><meta charset="utf-8"><title>${fixture.title}</title>
      <meta property="og:title" content="${fixture.title}"><meta property="og:site_name" content="${new URL(fixture.url).hostname.includes("kalibrr") ? "Kalibrr" : "LinkedIn"}">
      <style>p, .update-components-text { white-space: pre-wrap; } [hidden] { display:none; }</style><div id="fixture">${fixture.body}</div>
      ${fixture.structured ? `<script type="application/ld+json">${JSON.stringify(fixture.structured).replace(/</g, "\\u003c")}</script>` : ""}
      <script>
        const chrome = {runtime:{onMessage:{addListener(){}}}};
        ${background}
        ${fixture.delayedBody ? `setTimeout(() => document.getElementById('fixture').innerHTML = ${scriptLiteral(fixture.delayedBody)}, 200);` : ""}
        const runContent = new Function('document', 'location', 'DOMParser', 'setTimeout', 'return ' + ${scriptLiteral(content)});
        runContent(document, new URL(${scriptLiteral(fixture.url)}), DOMParser, setTimeout).then(page => {
          parent.postMessage({index:${index}, fields:extractJobData(page), error:page.extractionError || ''}, location.origin);
        }).catch(error => parent.postMessage({index:${index}, failure:error.message}, location.origin));
      </script>`);
    return;
  }
  if (request.url !== "/") { response.writeHead(404); response.end("Not found"); return; }
  response.end(`<!doctype html><meta charset="utf-8"><title>Job extraction regression checks</title>
    <h1>Job extraction regression checks</h1><p>Real DOM fixtures; no spreadsheet requests.</p><pre id="results">Running ${cases.length} cases…</pre>
    ${cases.map((_, i) => `<iframe title="Fixture ${i}" src="/case/${i}" style="width:600px;height:100px"></iframe>`).join("")}
    <script>
      const cases = ${scriptLiteral(cases.map(({name,expected,expectedError}) => ({name,expected,expectedError})))};
      const results = new Map();
      addEventListener('message', event => {
        if(event.origin !== location.origin || !Number.isInteger(event.data.index)) return;
        const {index,fields,error,failure} = event.data, test = cases[index];
        if(!test) return;
        const issues = failure ? [failure] : test.expectedError ? (error.includes(test.expectedError) ? [] : ['missing expected extraction error']) :
          Object.entries(test.expected).filter(([key,value]) => fields[key] !== value).map(([key,value]) => key+': expected '+value+'; got '+fields[key]);
        if(error && !test.expectedError) issues.push(error);
        results.set(index,{passed:issues.length===0,text:(issues.length?'FAIL':'PASS')+' '+test.name+(issues.length?' — '+issues.join('; '):'')});
        document.getElementById('results').textContent = [...results.values()].map(result=>result.text).join(String.fromCharCode(10))+String.fromCharCode(10)+
          [...results.values()].filter(result=>result.passed).length+'/'+cases.length+' passed; '+results.size+'/'+cases.length+' complete';
      });
    </script>`);
});
server.listen(8765, "127.0.0.1", () => process.stdout.write("Open http://127.0.0.1:8765 for DOM regression results.\n"));
