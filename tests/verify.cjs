// Offline regression checks. Run from the repository root: node --test tests/verify.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = (name) => fs.readFileSync(path.join(root, name), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));

function storage(initial = {}) {
  const data = { ...initial };
  return { data, api: {
    async get(keys) {
      if (keys === null) return { ...data };
      return Object.fromEntries(Object.entries(keys).map(([key, fallback]) =>
        [key, Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback]));
    },
    async set(patch) { Object.assign(data, patch); },
    async remove(keys) { for (const key of keys) delete data[key]; }
  } };
}

const scriptUrl = "https://script.google.com/macros/s/test/exec";
const response = (body, status = 200) => ({ status, ok: status >= 200 && status < 300, async text() {
  return typeof body === "string" ? body : JSON.stringify(body);
} });
const page = { title: "Data Analyst", url: "https://glints.com/jobs/123", hostname: "glints.com",
  meta: {}, jobPostings: [], siteFields: { title: "Data Analyst", company: "Example" }, hasPageText: true };

function background(initial = {}, fetcher = async () => response({ ok: true, row: 2 })) {
  const saved = storage({ appsScriptUrl: scriptUrl, ...initial });
  const calls = [], injections = [];
  let listener;
  const ctx = vm.createContext({ URL, Date, AbortSignal, chrome: {
    storage: { local: saved.api },
    runtime: { id: "test-extension", onMessage: { addListener(fn) { listener = fn; } } },
    tabs: { async get() { return { id: 1, url: page.url }; } },
    scripting: { async executeScript(options) { injections.push(plain(options)); return [{ result: page }]; } }
  }, async fetch(url, options) {
    calls.push({ url, headers: options.headers, body: JSON.parse(options.body), redirect: options.redirect });
    return fetcher();
  } });
  vm.runInContext(source("extension/background.js"), ctx);
  return { ctx, saved, calls, injections, listener };
}

test("structured job fields take priority and preserve explicit salary, location, and date", () => {
  const env = background();
  const fields = env.ctx.extractJobData({ ...page, jobPostings: [{
    title: "Structured Analyst", hiringOrganization: { name: "Structured Company" },
    jobLocation: [{ address: { addressLocality: "Jakarta", addressRegion: "DKI", addressCountry: "ID" } }],
    jobLocationType: "TELECOMMUTE", baseSalary: "Rp 8–10 juta", validThrough: "2026-11-08T23:59:00+07:00",
    description: "  Analyze data.   SQL required. "
  }] });
  assert.deepEqual(plain(fields), { nama_pekerjaan: "Structured Analyst", perusahaan: "Structured Company",
    lokasi: "Jakarta, DKI, ID", tipe_kerja: "Remote", range_gaji: "Rp 8–10 juta",
    deadline: "2026-11-08", deskripsi: "Analyze data. SQL required." });
});

test("site fields and metadata supply available fallback data", () => {
  const env = background();
  const fields = env.ctx.extractJobData({ ...page, meta: { ogTitle: "Meta Role", ogSiteName: "Meta Company",
    description: "Meta description" }, siteFields: { title: "Site Role", company: null, location: "Jakarta",
    workType: "work from office", salary: "Negotiable", deadline: "2026-11-01" } });
  assert.equal(fields.nama_pekerjaan, "Site Role");
  assert.equal(fields.perusahaan, "Meta Company");
  assert.equal(fields.tipe_kerja, "WFO");
  assert.equal(fields.range_gaji, "Negotiable");
  assert.equal(fields.deskripsi, "Meta description");
});

test("missing fields, numeric salary, and ambiguous or invalid dates are not invented", () => {
  const env = background();
  const fields = env.ctx.extractJobData({ ...page, title: "", siteFields: {}, jobPostings: [{
    baseSalary: { value: { minValue: 100, maxValue: 200 } }, validThrough: "2026-02-30"
  }] });
  assert.deepEqual(plain(fields), { nama_pekerjaan: "", perusahaan: "", lokasi: "", tipe_kerja: "",
    range_gaji: "", deadline: "", deskripsi: "" });
  assert.equal(env.ctx.normalizeSourceDeadline("3 hari lagi"), "");
  assert.equal(env.ctx.normalizeWorkType("On-site"), "On-site");
  assert.equal(env.ctx.normalizeWorkType("WFO"), "WFO");
});

test("source descriptions are cleaned and limited to 1500 characters", () => {
  const env = background();
  const fields = env.ctx.extractJobData({ ...page, siteFields: { description: "long text ".repeat(500) } });
  assert.equal(fields.deskripsi.length, 1500);
});

test("LinkedIn hiring posts preserve all explicit positions without choosing one", () => {
  const env = background();
  const text = "WE'RE HIRING\n\nExample Health Indonesia is still looking for professionals to join our growing team in Bekasi!\n\n" +
    "📌 Available Positions:\nClinic Manager\nGeneral Practitioner\nNurse\nLab Analyst\nRadiographer\nPharmacist\n" +
    "Assistant Pharmacist\nMedical Record\nPhysiotherapist\nRefractionist\nAdmission\nCashier\n\n" +
    "Application Deadline: Oct 31, 2026\n\n#Hiring";
  const fields = env.ctx.extractJobData({ ...page, pageKind: "linkedin-post", post: { text } });
  assert.equal(fields.nama_pekerjaan.split("; ").length, 12);
  assert.equal(fields.perusahaan, "Example Health Indonesia");
  assert.equal(fields.lokasi, "Bekasi");
  assert.equal(fields.deadline, "2026-10-31");
  assert.equal(fields.range_gaji, "");
  assert.equal(fields.tipe_kerja, "");
  assert.match(fields.deskripsi, /Available Positions/);
});

test("post labels can fill one role but author names and ambiguous facts are not guessed", () => {
  const env = background();
  const fields = env.ctx.extractPostFields("Posisi: Data Analyst\nPerusahaan: Example\nLokasi: Jakarta\n" +
    "Tipe kerja: Hybrid\nGaji: Rp 8–10 juta\nBatas akhir lamaran: 31 Oktober 2026");
  assert.equal(fields.nama_pekerjaan, "Data Analyst");
  assert.equal(fields.perusahaan, "Example");
  assert.equal(fields.tipe_kerja, "Hybrid");
  assert.equal(fields.range_gaji, "Rp 8–10 juta");
  assert.equal(fields.deadline, "2026-10-31");
  const unknown = env.ctx.extractJobData({ ...page, pageKind: "linkedin-post",
    post: { text: "WE ARE HIRING\nContact recruiter Example Person.\nDeadline: 31 Oct" },
    meta: { ogSiteName: "LinkedIn", ogTitle: "Posting | LinkedIn" } });
  assert.equal(unknown.nama_pekerjaan, "Posting lowongan LinkedIn");
  for (const field of ["perusahaan", "lokasi", "tipe_kerja", "range_gaji", "deadline"]) assert.equal(unknown[field], "");
});

test("only explicit valid dates with an unambiguous month and year are accepted", () => {
  const env = background();
  for (const text of ["Oct 31, 2026", "31 October 2026", "31 Oktober 2026", "31 Okt. 2026"])
    assert.equal(env.ctx.normalizeSourceDeadline(text), "2026-10-31");
  for (const text of ["31 Oct", "10/11/2026", "31 Februari 2026", "besok", "Oct 31, 26"])
    assert.equal(env.ctx.normalizeSourceDeadline(text), "");
});

test("hiring headline supplies the explicit role and separates a glued location sentence", () => {
  const env = background();
  const fields = env.ctx.extractPostFields("📢 We’re Hiring | External Audit – Senior Associate / Assistant Manager\n" +
    "Example Audit Indonesia is looking for talented professionals!\n" +
    "📍 Location: IndonesiaIf you’re ready to join us, apply now!");
  assert.equal(fields.nama_pekerjaan, "External Audit – Senior Associate / Assistant Manager");
  assert.equal(fields.perusahaan, "Example Audit Indonesia");
  assert.equal(fields.lokasi, "Indonesia");
  assert.equal(fields.deadline, "");
});

test("generic platform pages and unreadable LinkedIn posts cannot create junk rows", async () => {
  for (const fixture of [
    { ...page, hostname: "jobseeker.kalibrr.com", title: "Kalibrr: Where Jobs Find You", siteFields: {},
      meta: { ogTitle: "Kalibrr: Where Jobs Find You", ogSiteName: "Kalibrr", description: "Kalibrr: Where Jobs Find You" } },
    { ...page, hostname: "www.linkedin.com", title: "Posting | LinkedIn", siteFields: {}, meta: { ogSiteName: "LinkedIn" } },
    { ...page, extractionError: "Teks posting LinkedIn belum terbaca. Buka posting lengkap." }
  ]) {
    const env = background();
    env.ctx.chrome.scripting.executeScript = async () => [{ result: fixture }];
    await assert.rejects(() => env.ctx.saveJob(1), /belum berhasil dibaca|belum terbaca/);
    assert.equal(env.calls.length, 0);
  }
});

test("posting extraction saves a single row containing the current post facts", async () => {
  const env = background();
  env.ctx.chrome.scripting.executeScript = async () => [{ result: { ...page,
    url: "https://www.linkedin.com/posts/example-activity-123-test", hostname: "www.linkedin.com", pageKind: "linkedin-post",
    post: { text: "Position: Analyst\nCompany: Example Health\nPlacement: Bekasi\nApplication Deadline: Oct 31, 2026" }
  } }];
  assert.equal((await env.ctx.saveJob(1)).ok, true);
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].body.nama_pekerjaan, "Analyst");
  assert.equal(env.calls[0].body.perusahaan, "Example Health");
  assert.equal(env.calls[0].body.platform, "LinkedIn");
  assert.equal(env.calls[0].body.deadline, "2026-10-31");
});

test("saving reads the chosen tab and sends one row only to the configured spreadsheet endpoint", async () => {
  const env = background();
  assert.deepEqual(plain(await env.ctx.saveJob(1)), { ok: true, row: 2,
    nama_pekerjaan: "Data Analyst", perusahaan: "Example" });
  assert.deepEqual(env.injections, [{ target: { tabId: 1 }, files: ["content.js"] }]);
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].url, scriptUrl);
  assert.equal(env.calls[0].headers["Content-Type"], "text/plain");
  assert.equal(env.calls[0].redirect, "follow");
  assert.equal(env.calls[0].body.link, page.url);
  assert.equal(env.calls[0].body.platform, "Glints");
});

test("missing tab URL metadata can still save using the URL extracted from the page", async () => {
  for (const url of [undefined, ""]) {
    const env = background();
    env.ctx.chrome.tabs.get = async () => ({ id: 1, url });
    assert.equal((await env.ctx.saveJob(1)).ok, true);
    assert.equal(env.calls.length, 1);
    assert.equal(env.calls[0].body.link, page.url);
  }
});

test("restricted URLs remain blocked before saving, including URLs returned by extraction", async () => {
  for (const url of ["chrome://extensions/", "file:///local/page.html",
    "https://chromewebstore.google.com/detail/example"]) {
    const env = background();
    env.ctx.chrome.tabs.get = async () => ({ id: 1, url });
    await assert.rejects(() => env.ctx.saveJob(1), /tidak boleh/);
    assert.equal(env.injections.length, 0);
    assert.equal(env.calls.length, 0);
  }
  const env = background();
  env.ctx.chrome.tabs.get = async () => ({ id: 1 });
  env.ctx.chrome.scripting.executeScript = async () => [{ result: { ...page, url: "chrome://settings/" } }];
  await assert.rejects(() => env.ctx.saveJob(1), /tidak boleh/);
  assert.equal(env.calls.length, 0);
});

test("missing injection permission gives recovery steps and cannot post a job", async () => {
  const env = background();
  env.ctx.chrome.tabs.get = async () => ({ id: 1 });
  env.ctx.chrome.scripting.executeScript = async () => { throw new Error("Missing host permission"); };
  await assert.rejects(() => env.ctx.saveJob(1), (error) => {
    assert.match(error.message, /ikon Lamaran Tracker di toolbar/);
    assert.match(error.message, /refresh halaman/);
    assert.match(error.message, /Missing host permission/);
    return true;
  });
  assert.equal(env.calls.length, 0);
});

test("invalid destination URLs and missing tab IDs stop before injection", async () => {
  for (const appsScriptUrl of ["", "https://example.com/exec", "https://script.google.com/macros/s/test/dev"]) {
    const env = background({ appsScriptUrl });
    await assert.rejects(() => env.ctx.saveJob(1), /URL/);
    assert.equal(env.injections.length, 0);
  }
  await assert.rejects(() => background().ctx.saveJob(undefined), /Tab aktif/);
});

test("empty or missing page results do not produce an empty spreadsheet row", async () => {
  for (const result of [null, { ...page, hasPageText: false, siteFields: {} }]) {
    const env = background();
    env.ctx.chrome.scripting.executeScript = async () => [{ result }];
    await assert.rejects(() => env.ctx.saveJob(1), /tidak mengembalikan|Halaman kosong/);
    assert.equal(env.calls.length, 0);
  }
});

test("invalid web app responses never report success", async () => {
  for (const reply of [response("<html>login</html>"), response({ ok: false, error: "Write failed" }),
    response({ ok: true, row: 1 }), response({ error: "Unavailable" }, 503)]) {
    const env = background({}, async () => reply);
    await assert.rejects(() => env.ctx.saveJob(1), /JSON|Write failed|valid|HTTP 503/);
    assert.equal(env.calls.length, 1);
  }
});

test("network failures and timeouts identify the spreadsheet request", async () => {
  for (const [name, expected] of [["TypeError", /jaringan ke Apps Script/], ["TimeoutError", /25 detik/]]) {
    const env = background({}, async () => { const error = new Error("offline"); error.name = name; throw error; });
    await assert.rejects(() => env.ctx.saveJob(1), expected);
    assert.equal(env.calls.length, 1);
  }
});

test("background accepts only the supported save message from this extension", async () => {
  const env = background();
  assert.equal(env.listener({ type: "UNKNOWN" }, { id: "test-extension" }, () => {}), false);
  assert.equal(env.listener({ type: "SAVE_JOB", tabId: 1 }, { id: "another-extension" }, () => {}), false);
  const result = await new Promise((resolve) => {
    assert.equal(env.listener({ type: "SAVE_JOB", tabId: 1 }, { id: "test-extension" }, resolve), true);
  });
  assert.equal(result.ok, true);
  assert.equal(env.calls.length, 1);
});

function popup(initial) {
  const saved = storage(initial);
  const events = [], nodes = {};
  for (const id of ["apps-script-url", "save-job", "save-status"]) {
    nodes[id] = { value: "", dataset: {}, textContent: "", listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; } };
  }
  const ctx = vm.createContext({ document: { getElementById: (id) => nodes[id] }, chrome: {
    storage: { local: saved.api }, tabs: { async query() { return [{ id: 1 }]; } },
    runtime: { async sendMessage(message) {
      events.push({ message: plain(message), stored: { ...saved.data } });
      return { ok: true, nama_pekerjaan: "Analyst", perusahaan: "Example" };
    } }
  } });
  vm.runInContext(source("extension/popup.js"), ctx);
  return { saved, nodes, events, ctx };
}

test("popup preserves the spreadsheet URL and cleans up retired settings", async () => {
  const env = popup({ appsScriptUrl: scriptUrl, oldSecret: "retired-secret", oldRoute: "retired-route",
    lastChoice: "retired-choice" });
  await tick();
  assert.deepEqual(env.saved.data, { appsScriptUrl: scriptUrl });
  assert.equal(env.nodes["apps-script-url"].value, scriptUrl);
  assert.equal(env.nodes["save-job"].disabled, false);
});

test("popup saves the latest URL before sending the single save action", async () => {
  const env = popup({ appsScriptUrl: scriptUrl });
  await tick();
  const updated = "https://script.google.com/macros/s/updated/exec";
  env.nodes["apps-script-url"].value = updated;
  env.nodes["apps-script-url"].listeners.input();
  await env.nodes["save-job"].listeners.click();
  assert.equal(env.events.length, 1);
  assert.deepEqual(env.events[0].message, { type: "SAVE_JOB", tabId: 1 });
  assert.equal(env.events[0].stored.appsScriptUrl, updated);
  assert.equal(env.nodes["save-status"].textContent, "Tersimpan: Analyst - Example");
  assert.equal(env.nodes["save-status"].dataset.kind, "success");
});

test("popup needs a destination and stops saving if settings cannot be persisted", async () => {
  const empty = popup({});
  await tick();
  await empty.nodes["save-job"].listeners.click();
  assert.match(empty.nodes["save-status"].textContent, /Isi URL/);
  assert.equal(empty.events.length, 0);
  const env = popup({ appsScriptUrl: scriptUrl });
  await tick();
  env.saved.api.set = async () => { throw new Error("Storage full"); };
  env.nodes["apps-script-url"].value = scriptUrl + "?updated";
  env.nodes["apps-script-url"].listeners.input();
  await tick();
  assert.equal(env.nodes["save-job"].disabled, true);
  await env.nodes["save-job"].listeners.click();
  assert.equal(env.events.length, 0);
  assert.match(env.nodes["save-status"].textContent, /Storage full/);
});

// Minimal stateful Apps Script doubles: values/formulas, style, filters, rules, and banding.
class Range {
  constructor(sheet, row, col, rows = 1, cols = 1) { Object.assign(this, { sheet, row, col, rows, cols }); }
  cells(fn) { for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) fn(this.sheet.cell(this.row + r, this.col + c), r, c); return this; }
  grid(key) { return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.cols }, (_, c) => this.sheet.cell(this.row + r, this.col + c)[key])); }
  getValues() { return this.grid("value"); }
  getFormulas() { return this.grid("formula"); }
  setValues(data) { return this.cells((cell, r, c) => { cell.value = data[r][c]; cell.formula = ""; }); }
  setValue(value) { return this.setValues([[value]]); }
  setFormulas(data) { return this.cells((cell, r, c) => { cell.formula = data[r][c]; cell.value = ""; }); }
  setFormula(value) { return this.setFormulas([[value]]); }
  setRichTextValues(data) { return this.setValues(data.map((row) => row.map((value) => value.text))); }
  getRow() { return this.row; } getColumn() { return this.col; }
  getNumRows() { return this.rows; } getNumColumns() { return this.cols; }
  getLastRow() { return this.row + this.rows - 1; } getLastColumn() { return this.col + this.cols - 1; }
  getSheet() { return this.sheet; }
  createFilter() { const filter = { range: this, criteria: {}, getRange() { return this.range; }, getColumnFilterCriteria(c) { return this.criteria[c]; }, setColumnFilterCriteria(c, v) { this.criteria[c] = v; return this; }, remove: () => { this.sheet.filter = null; } }; this.sheet.filter = filter; return filter; }
  applyRowBanding() { const band = { range: this, getRange() { return this.range; }, setRange(range) { this.range = range; return this; }, remove: () => { this.sheet.bands = this.sheet.bands.filter((value) => value !== band); } }; for (const key of ["HeaderRowColor", "FirstRowColor", "SecondRowColor"]) band[`set${key}`] = function (value) { this[key] = value; return this; }; this.sheet.bands.push(band); return band; }
}
for (const key of ["NumberFormat", "DataValidation", "FontFamily", "FontSize", "FontColor", "FontWeight", "VerticalAlignment", "HorizontalAlignment", "WrapStrategy", "Background", "Border"]) {
  Range.prototype[`set${key}`] = function (...values) { this.sheet.mutations++; return this.cells((cell) => { cell.style[key] = values.length === 1 ? values[0] : values; }); };
}
class Sheet {
  constructor(rows = 100, cols = 26) { Object.assign(this, { rows, cols, entries: new Map(), bands: [], filter: null, rules: [], hidden: new Set(), widths: {}, heights: {}, autoResizes: [], mutations: 0 }); }
  cell(r, c) { const key = `${r},${c}`; if (!this.entries.has(key)) this.entries.set(key, { value: "", formula: "", style: {} }); return this.entries.get(key); }
  getRange(...args) { return new Range(this, ...args); }
  getMaxRows() { return this.rows; } getMaxColumns() { return this.cols; }
  getLastRow() { return Math.max(0, ...[...this.entries].filter(([, cell]) => cell.value !== "" || cell.formula !== "").map(([key]) => Number(key.split(",")[0]))); }
  getLastColumn() { return Math.max(0, ...[...this.entries].filter(([, cell]) => cell.value !== "" || cell.formula !== "").map(([key]) => Number(key.split(",")[1]))); }
  getName() { return "Lamaran Tracker"; } getParent() { return this.parent; }
  getBandings() { return [...this.bands]; } getFilter() { return this.filter; }
  getConditionalFormatRules() { return this.rules; } setConditionalFormatRules(rules) { this.rules = rules; }
  insertRowsAfter(row, count) { this.rows += count; } insertColumnsAfter(col, count) { this.cols += count; }
  autoResizeRows(row, count) {
    this.autoResizes.push({ row, count, descriptionWidth: this.widths[14], wrap: this.cell(row, 14).style.WrapStrategy,
      descriptions: this.getRange(row, 14, count, 1).getValues() });
    return this;
  }
  setRowHeight(row, height) { this.heights[row] = height; } setColumnWidth(col, width) { this.widths[col] = width; }
  setFrozenRows(value) { this.frozenRows = value; } setFrozenColumns(value) { this.frozenCols = value; }
  setHiddenGridlines(value) { this.gridHidden = value; } setTabColor(value) { this.tabColor = value; }
  showColumns(col, count) { for (let c = col; c < col + count; c++) this.hidden.delete(c); }
  hideColumns(col, count) { for (let c = col; c < col + count; c++) this.hidden.add(c); }
}
function conditionalRule() {
  return { whenTextEqualTo(value) { this.kind = "TEXT_EQUAL_TO"; this.value = value; return this; }, whenFormulaSatisfied(value) { this.kind = "CUSTOM_FORMULA"; this.value = value; return this; }, setBackground() { return this; }, setFontColor() { return this; }, setRanges(ranges) { this.ranges = ranges; return this; }, build() { const { kind, value, ranges } = this; return { getBooleanCondition: () => ({ getCriteriaType: () => kind, getCriteriaValues: () => [value] }), getRanges: () => ranges }; } };
}
function appsScript(rows, cols) {
  const sheet = new Sheet(rows, cols);
  const properties = new Map();
  const spreadsheet = { getSheetByName: () => sheet, getId: () => "sheet-id", getSpreadsheetTimeZone: () => "Asia/Jakarta" };
  sheet.parent = spreadsheet;
  const ctx = vm.createContext({ Date, SpreadsheetApp: {
    getActiveSpreadsheet: () => spreadsheet, openById(id) { assert.equal(id, "sheet-id"); return spreadsheet; }, flush() {},
    newDataValidation: () => ({ requireValueInList(values, show) { this.show = show; return this; }, setAllowInvalid(value) { this.invalid = value; return this; }, build() { return { show: this.show, invalid: this.invalid }; } }),
    newRichTextValue: () => ({ setText(text) { this.text = text; return this; }, build() { return { text: this.text }; } }),
    newConditionalFormatRule: conditionalRule, BooleanCriteria: { TEXT_EQUAL_TO: "TEXT_EQUAL_TO", CUSTOM_FORMULA: "CUSTOM_FORMULA" },
    WrapStrategy: { WRAP: "WRAP", CLIP: "CLIP" }, BandingTheme: { LIGHT_GREY: "LIGHT_GREY" }, BorderStyle: { SOLID: "SOLID" }
  }, LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key), setProperty: (key, value) => properties.set(key, value) }) },
  Utilities: { parseDate: (value) => new Date(`${value}T00:00:00+07:00`), formatDate: (date) => new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10) },
  ContentService: { MimeType: { JSON: "JSON" }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) }
  });
  vm.runInContext(source("apps-script/Code.gs"), ctx);
  return { ctx, sheet, properties, post: (data) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(data) } }).text) };
}

test("setup applies a readable layout and keeps unused columns/rows clean", () => {
  const { ctx, sheet } = appsScript();
  ctx.setupSheet();
  assert.equal(sheet.cell(1, 1).style.Background, "#17324d");
  assert.equal(sheet.cell(1, 1).style.FontColor, "#ffffff");
  assert.equal(sheet.cell(1, 14).style.WrapStrategy, "WRAP");
  assert.ok(sheet.widths[2] >= 200);
  assert.ok(sheet.widths[14] >= 300);
  assert.equal(sheet.frozenRows, 1);
  assert.equal(sheet.frozenCols, 3);
  assert.equal(sheet.gridHidden, true);
  assert.equal(sheet.hidden.has(15), true);
  assert.equal(sheet.hidden.has(14), false);
  assert.equal(sheet.cell(50, 5).style.DataValidation.show, false);
  assert.equal(sheet.cell(50, 5).style.DataValidation.invalid, false);
  assert.equal(sheet.filter.getRange().getNumColumns(), 14);
});

test("repeated setup preserves data, custom formulas, frozen waiting days, and user rules", () => {
  const { ctx, sheet } = appsScript();
  ctx.setupSheet();
  sheet.getRange(2, 2).setValue("Existing role");
  sheet.getRange(2, 5).setValue("Applied");
  sheet.getRange(2, 11).setFormula("=CUSTOM()");
  sheet.getRange(3, 2).setValue("Closed role");
  sheet.getRange(3, 5).setValue("Offer");
  sheet.getRange(3, 12).setValue(12);
  sheet.getRange(3, 14).setValue("long description ".repeat(300));
  sheet.getRange(3, 16).setValue("Extra data");
  const custom = conditionalRule().whenTextEqualTo("Custom").setRanges([sheet.getRange(2, 2, 4)]).build();
  sheet.rules.push(custom);
  ctx.setupSheet(); ctx.setupSheet();
  assert.equal(sheet.cell(2, 2).value, "Existing role");
  assert.equal(sheet.cell(2, 11).formula, "=CUSTOM()");
  assert.match(sheet.cell(2, 12).formula, /^=IF/);
  assert.equal(sheet.cell(3, 12).value, 12);
  assert.equal(sheet.cell(3, 12).formula, "");
  assert.equal(sheet.cell(3, 14).value, "long description ".repeat(300));
  assert.equal(sheet.cell(3, 16).value, "Extra data");
  assert.equal(sheet.rules.length, 10);
  assert.equal(sheet.rules.includes(custom), true);
  assert.equal(sheet.bands.length, 1);
  assert.equal(sheet.cell(2, 5).style.DataValidation.show, true);
  const fit = sheet.autoResizes.at(-1);
  assert.equal(fit.row, 2);
  assert.equal(fit.count, 2);
  assert.equal(fit.descriptionWidth, 360);
  assert.equal(fit.wrap, "WRAP");
  assert.equal(fit.descriptions[1][0], "long description ".repeat(300));
  assert.equal(sheet.heights[1], 52);
});

test("mismatching headers stop setup before changing data or formatting", () => {
  const { ctx, sheet } = appsScript();
  sheet.getRange(1, 1).setValue("Different table");
  sheet.getRange(2, 2).setValue("Keep me");
  assert.throws(() => ctx.setupSheet(), /tidak cocok/);
  assert.equal(sheet.mutations, 0);
  assert.equal(sheet.cell(2, 2).value, "Keep me");
  assert.equal(sheet.gridHidden, undefined);
});

test("appended rows are literal, styled, filtered, and ignore phantom K/L formulas", () => {
  const env = appsScript(); const { ctx, sheet } = env;
  ctx.setupSheet();
  sheet.getRange(90, 11).setFormula("=TODAY()");
  const filterCriteria = { value: "Applied" };
  sheet.filter.setColumnFilterCriteria(5, filterCriteria);
  const first = env.post({ nama_pekerjaan: "=IMPORTXML(\"evil\")", perusahaan: "Example", tipe_kerja: "remote", deadline: "2026-02-30", link: "https://example.com/job", deskripsi: "full text ".repeat(500) });
  assert.deepEqual(first, { ok: true, row: 2 });
  const second = env.post({ nama_pekerjaan: "Second job" });
  assert.equal(second.row, 3);
  assert.equal(sheet.cell(2, 2).value, "=IMPORTXML(\"evil\")");
  assert.equal(sheet.cell(2, 2).formula, "");
  assert.equal(sheet.cell(2, 1).value instanceof Date, true);
  assert.equal(sheet.cell(2, 9).value instanceof Date, true);
  assert.equal(sheet.cell(2, 10).value, "");
  assert.equal(sheet.cell(2, 7).value, "Remote");
  assert.equal(sheet.cell(2, 14).value, "full text ".repeat(500));
  assert.equal(sheet.autoResizes[0].descriptions[0][0], "full text ".repeat(500));
  assert.equal(sheet.autoResizes[0].descriptionWidth, 360);
  assert.equal(sheet.autoResizes[0].wrap, "WRAP");
  assert.equal(sheet.autoResizes.at(-1).row, 3);
  assert.equal(sheet.autoResizes.at(-1).count, 1);
  assert.equal(sheet.cell(3, 14).style.WrapStrategy, "WRAP");
  assert.equal(sheet.cell(3, 5).style.DataValidation.show, true);
  assert.equal(sheet.filter.getRange().getNumRows(), 3);
  assert.equal(sheet.filter.getColumnFilterCriteria(5), filterCriteria);
  assert.equal(sheet.bands[0].getRange().getNumRows(), 3);
});

test("growing the sheet also grows conditional color ranges", () => {
  const env = appsScript(2, 14);
  env.ctx.setupSheet();
  assert.equal(env.post({ nama_pekerjaan: "One" }).row, 2);
  assert.equal(env.post({ nama_pekerjaan: "Two" }).row, 3);
  assert.equal(env.sheet.rows, 3);
  assert.equal(env.sheet.rules.length, 9);
  for (const rule of env.sheet.rules) assert.equal(rule.getRanges()[0].getLastRow(), 3);
});

test("terminal status freezes waiting days and reopening restores the formula", () => {
  const env = appsScript(); const { ctx, sheet } = env;
  ctx.setupSheet(); env.post({ nama_pekerjaan: "Analyst" });
  sheet.getRange(2, 5).setValue("Offer");
  ctx.onEdit({ range: sheet.getRange(2, 5) });
  assert.equal(sheet.cell(2, 12).formula, "");
  assert.equal(typeof sheet.cell(2, 12).value, "number");
  const frozen = sheet.cell(2, 12).value;
  sheet.getRange(2, 14).setValue("Updated description\n".repeat(30));
  ctx.onEdit({ range: sheet.getRange(2, 14) });
  assert.equal(sheet.autoResizes.at(-1).descriptions[0][0], "Updated description\n".repeat(30));
  assert.equal(sheet.cell(2, 12).value, frozen);
  assert.equal(sheet.cell(2, 12).formula, "");
  sheet.getRange(2, 5).setValue("Rejected"); ctx.onEdit({ range: sheet.getRange(2, 5) });
  assert.equal(sheet.cell(2, 12).value, frozen);
  sheet.getRange(2, 5).setValue("Applied"); ctx.onEdit({ range: sheet.getRange(2, 5) });
  assert.match(sheet.cell(2, 12).formula, /^=IF/);
});

test("manifest and popup expose only the spreadsheet save flow", () => {
  const manifest = JSON.parse(source("extension/manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "1.3.1");
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://script.google.com/*", "https://script.googleusercontent.com/*"]);
  assert.deepEqual(fs.readdirSync(path.join(root, "extension")).sort(),
    ["background.js", "content.js", "manifest.json", "popup.css", "popup.html", "popup.js"]);
  const html = source("extension/popup.html");
  assert.equal((html.match(/<input\b/g) || []).length, 1);
  assert.equal((html.match(/<button\b/g) || []).length, 1);
  assert.match(html, /src="popup.js"/);
});
