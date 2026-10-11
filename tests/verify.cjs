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
    async get(keys) { return keys === null ? { ...data } : { ...keys, ...data }; },
    async set(patch) { Object.assign(data, patch); },
    async remove(keys) { for (const key of keys) delete data[key]; }
  } };
}

function routes() {
  const ctx = vm.createContext({ URL });
  vm.runInContext(source("extension/ai-route.js"), ctx);
  return ctx.AiRoutes;
}

const routeCases = [
  ["apodex/apodex-1.1-mini:free", "openrouter", "apodex/apodex-1.1-mini:free", "https://openrouter.ai/api/v1/chat/completions"],
  ["openrouter:openai/gpt-4.1-mini", "openrouter", "openai/gpt-4.1-mini", "https://openrouter.ai/api/v1/chat/completions"],
  ["openai:gpt-4.1-mini", "openai", "gpt-4.1-mini", "https://api.openai.com/v1/chat/completions"],
  ["gpt-4.1-mini", "openai", "gpt-4.1-mini", "https://api.openai.com/v1/chat/completions"],
  ["o3-mini", "openai", "o3-mini", "https://api.openai.com/v1/chat/completions"],
  ["anthropic:claude-sonnet-4-6", "anthropic", "claude-sonnet-4-6", "https://api.anthropic.com/v1/messages"],
  ["claude-sonnet-4-6", "anthropic", "claude-sonnet-4-6", "https://api.anthropic.com/v1/messages"],
  ["https://openrouter.ai/apodex/apodex-1.1-mini:free", "openrouter", "apodex/apodex-1.1-mini:free", "https://openrouter.ai/api/v1/chat/completions"],
  ["https://api.example.com/v1#vendor/model", "compatible", "vendor/model", "https://api.example.com/v1/chat/completions"],
  ["https://api.example.com/v1/chat/completions#model-1", "compatible", "model-1", "https://api.example.com/v1/chat/completions"],
  ["https://api.anthropic.com/v1/messages#claude-sonnet-4-6", "anthropic", "claude-sonnet-4-6", "https://api.anthropic.com/v1/messages"],
  ["http://localhost:1234/v1#local-model", "compatible", "local-model", "http://localhost:1234/v1/chat/completions"]
];
for (const [input, provider, model, endpoint] of routeCases) {
  test(`route resolves: ${input}`, () => {
    const result = routes().resolve(input);
    assert.equal(result.provider, provider);
    assert.equal(result.model, model);
    assert.equal(result.endpoint, endpoint);
    assert.equal(result.permissionOrigin, `${new URL(endpoint).protocol}//${new URL(endpoint).hostname}/*`);
  });
}

test("invalid or incomplete routes explain the correction", () => {
  const api = routes();
  for (const value of ["", "Apodex", "https://api.example.com/v1", "https://user:secret@api.example.com/v1#m", "openai:org/model", "https://openrouter.ai/org/%zz"]) {
    assert.throws(() => api.resolve(value), /[Rr]ute|model|kredensial/);
  }
});

test("legacy migration fixes the pictured OpenRouter webpage without losing explicit routes", () => {
  const api = routes();
  assert.equal(api.migrateLegacySettings({ baseUrl: "https://openrouter.ai/apodex/apodex-1.1-mini:free", model: "Apodex" }), "openrouter:apodex/apodex-1.1-mini:free");
  assert.equal(api.migrateLegacySettings({ baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" }), "openai:gpt-4.1-mini");
  assert.equal(api.migrateLegacySettings({ baseUrl: "https://api.example.com/v1", model: "org/model" }), "https://api.example.com/v1#org%2Fmodel");
  assert.equal(api.migrateLegacySettings({ modelRoute: "anthropic:claude-sonnet-4-6", model: "old" }), "anthropic:claude-sonnet-4-6");
});

const chatReply = (content = "OK") => ({ choices: [{ message: { role: "assistant", content } }] });
const response = (body, status = 200) => ({ status, ok: status >= 200 && status < 300, async text() { return typeof body === "string" ? body : JSON.stringify(body); } });
const page = { title: "Data Analyst", url: "https://glints.com/jobs/123", hostname: "glints.com", meta: {}, jobPostings: [], siteFields: { title: "Data Analyst", company: "Example" }, jobText: "Analyst duties" };
function background(initial = {}, fetcher = async () => response(chatReply())) {
  const saved = storage({ apiKey: "test-key", modelRoute: "openai:gpt-4.1-mini", ...initial });
  const calls = [];
  const ctx = vm.createContext({ URL, Date, AbortSignal, chrome: {
    storage: { local: saved.api }, runtime: { id: "test-extension", onMessage: { addListener() {} } },
    tabs: { async get() { return { url: page.url }; } },
    scripting: { async executeScript() { return [{ result: page }]; } }
  }, async fetch(url, options) { const call = { url, headers: options.headers, body: JSON.parse(options.body) }; calls.push(call); return fetcher(call, saved); } });
  ctx.importScripts = (name) => vm.runInContext(source(`extension/${name}`), ctx);
  vm.runInContext(source("extension/background.js"), ctx);
  return { ctx, saved, calls };
}
const payload = { temperature: 0, messages: [{ role: "system", content: "Extract JSON" }, { role: "user", content: "Job" }], max_tokens: 64 };

test("direct OpenAI uses Bearer and max_completion_tokens", async () => {
  const env = background();
  await env.ctx.requestChat(env.saved.data, payload);
  const call = env.calls[0];
  assert.equal(call.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(call.headers.Authorization, "Bearer test-key");
  assert.equal(call.body.model, "gpt-4.1-mini");
  assert.equal(call.body.max_completion_tokens, 64);
  assert.equal(call.body.max_tokens, undefined);
  assert.equal(call.body.temperature, 0);
});

test("OpenAI reasoning routes omit unsupported temperature", async () => {
  for (const modelRoute of ["openai:o3-mini", "openai:gpt-5-mini"]) {
    const env = background({ modelRoute });
    await env.ctx.requestChat(env.saved.data, payload);
    assert.equal(env.calls[0].body.temperature, undefined);
  }
});

test("Anthropic uses native headers, separate system, and normalizes text blocks", async () => {
  const env = background({ modelRoute: "anthropic:claude-sonnet-4-6" }, async () => response({ type: "message", content: [{ type: "thinking", thinking: "private" }, { type: "text", text: "OK" }] }));
  assert.equal((await env.ctx.requestChat(env.saved.data, payload)).content, "OK");
  const call = env.calls[0];
  assert.equal(call.url, "https://api.anthropic.com/v1/messages");
  assert.equal(call.headers["x-api-key"], "test-key");
  assert.equal(call.headers["anthropic-version"], "2023-06-01");
  assert.equal(call.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(call.headers.Authorization, undefined);
  assert.equal(call.body.system, "Extract JSON");
  assert.deepEqual(plain(call.body.messages), [{ role: "user", content: "Job" }]);
  assert.equal(call.body.max_tokens, 64);
  assert.equal(call.body.temperature, undefined);
});

test("OpenRouter and another compatible API receive their own route and token field", async () => {
  for (const modelRoute of ["apodex/apodex-1.1-mini:free", "https://api.example.com/v1#vendor/model"]) {
    const env = background({ modelRoute });
    await env.ctx.requestChat(env.saved.data, payload);
    assert.equal(env.calls[0].body.max_tokens, 64);
    assert.equal(env.calls[0].body.max_completion_tokens, undefined);
    assert.equal(env.calls[0].headers.Authorization, "Bearer test-key");
    assert.equal(env.calls[0].url.includes("#"), false);
  }
});

test("HTML failures are concise and explain endpoint mistakes", async () => {
  const env = background({}, async () => response("<!DOCTYPE html><html><head>" + "large page".repeat(1000), 404));
  await assert.rejects(() => env.ctx.requestChat(env.saved.data, payload), (error) => {
    assert.match(error.message, /OpenAI · HTTP 404/);
    assert.match(error.message, /HTML/);
    assert.equal(error.message.includes("<!DOCTYPE"), false);
    assert.ok(error.message.length < 500);
    return true;
  });
});

test("provider errors retain actions and detail while hiding the key", async () => {
  const env = background({}, async () => response({ error: { message: "Invalid key test-key" } }, 401));
  await assert.rejects(() => env.ctx.requestChat(env.saved.data, payload), (error) => {
    assert.match(error.message, /Kunci API tidak valid/);
    assert.match(error.message, /Invalid key/);
    assert.equal(error.message.includes("test-key"), false);
    return true;
  });
});

test("errors embedded in HTTP 200 remain failures", async () => {
  const env = background({}, async () => response({ error: { code: 429, message: "Rate limited" } }));
  await assert.rejects(() => env.ctx.requestChat(env.saved.data, payload), /kode 429[\s\S]*kuota/);
});

test("malformed JSON, incorrect response shapes, and network failures stay clear", async () => {
  for (const fetcher of [async () => response("not JSON"), async () => response({ choices: [] }), async () => { throw new Error("offline"); }]) {
    const env = background({}, fetcher);
    await assert.rejects(() => env.ctx.requestChat(env.saved.data, payload), /format|choices|jaringan/);
  }
});

test("connection success unlocks AI but a settings change during a check cannot unlock it", async () => {
  const env = background({ aiVerified: true, mode: "ai" });
  const result = await env.ctx.checkAiConnection();
  assert.equal(result.provider, "OpenAI");
  assert.equal(env.saved.data.aiVerified, true);
  assert.equal(env.saved.data.mode, "manual");
  const changed = background({}, async (call, saved) => { saved.data.modelRoute = "anthropic:claude-sonnet-4-6"; return response(chatReply()); });
  await assert.rejects(() => changed.ctx.checkAiConnection(), /berubah/);
  assert.equal(changed.saved.data.aiVerified, false);
});

test("bad or empty AI output never posts a job to Sheets", async () => {
  for (const content of ["", "not JSON", "```json\n{bad}\n```"] ) {
    const env = background({ aiVerified: true, appsScriptUrl: "https://script.google.com/macros/s/test/exec" }, async () => response(chatReply(content)));
    await assert.rejects(() => env.ctx.saveJob(1, "ai"), /kosong|JSON/);
    assert.equal(env.calls.length, 1);
    assert.equal(env.calls[0].url.includes("script.google.com"), false);
  }
});

test("valid AI output posts extracted fields with the actual platform and source link", async () => {
  const fields = { nama_pekerjaan: "Analyst", perusahaan: "Example", tipe_kerja: "remote", deadline: "2026-02-30", deskripsi: "Work. Requirements.", platform: "fake", link: "fake" };
  const env = background({ aiVerified: true, appsScriptUrl: "https://script.google.com/macros/s/test/exec" }, async (call) => call.url.includes("script.google.com") ? response({ ok: true, row: 2 }) : response(chatReply(JSON.stringify(fields))));
  assert.equal((await env.ctx.saveJob(1, "ai")).ok, true);
  assert.equal(env.calls[0].body.max_completion_tokens, 2048);
  assert.equal(env.calls[1].headers["Content-Type"], "text/plain");
  assert.equal(env.calls[1].body.platform, "Glints");
  assert.equal(env.calls[1].body.link, page.url);
  assert.equal(env.calls[1].body.deadline, "");
  assert.equal(env.calls[1].body.tipe_kerja, "Remote");
});

function popup(initial) {
  const saved = storage(initial);
  const events = [];
  const nodes = {};
  for (const id of ["api-key", "model-route", "route-info", "apps-script-url", "ai-mode", "manual-mode", "mode-help", "check-connection", "connection-status", "save-job", "save-status"]) {
    nodes[id] = { value: "", dataset: {}, textContent: "", listeners: {}, attrs: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, setAttribute(key, value) { this.attrs[key] = value; } };
  }
  const ctx = vm.createContext({ URL, document: { getElementById: (id) => nodes[id] }, chrome: {
    storage: { local: saved.api }, permissions: { async request(value) { events.push(value); return true; } },
    runtime: { async sendMessage(value) { events.push(value); await saved.api.set({ aiVerified: true }); return { ok: true, provider: "Anthropic" }; } }
  } });
  vm.runInContext(source("extension/ai-route.js"), ctx);
  vm.runInContext(source("extension/popup.js"), ctx);
  return { saved, nodes, events, ctx };
}

test("popup migration preserves key/Sheets URL and requires rechecking the corrected route", async () => {
  const env = popup({ apiKey: "old-key", baseUrl: "https://openrouter.ai/apodex/apodex-1.1-mini:free", model: "Apodex", appsScriptUrl: "old-url", aiVerified: true, mode: "ai" });
  await tick();
  assert.equal(env.nodes["model-route"].value, "openrouter:apodex/apodex-1.1-mini:free");
  assert.equal(env.saved.data.apiKey, "old-key");
  assert.equal(env.saved.data.appsScriptUrl, "old-url");
  assert.equal(env.saved.data.baseUrl, undefined);
  assert.equal(env.saved.data.model, undefined);
  assert.equal(env.saved.data.aiVerified, false);
  assert.equal(env.nodes["ai-mode"].disabled, true);
});

test("popup requests the resolved provider permission during the click and resets after edits", async () => {
  const env = popup({ apiKey: "key", modelRoute: "anthropic:claude-sonnet-4-6" });
  await tick();
  const check = env.nodes["check-connection"].listeners.click();
  assert.deepEqual(plain(env.events[0]), { origins: ["https://api.anthropic.com/*"] });
  await check;
  assert.equal(env.nodes["ai-mode"].disabled, false);
  env.nodes["ai-mode"].listeners.click();
  env.nodes["model-route"].value = "openai:gpt-4.1-mini";
  env.nodes["model-route"].listeners.input();
  await tick();
  assert.equal(env.saved.data.aiVerified, false);
  assert.equal(env.saved.data.mode, "manual");
  assert.match(env.nodes["route-info"].textContent, /OpenAI/);
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
  constructor(rows = 100, cols = 26) { Object.assign(this, { rows, cols, entries: new Map(), bands: [], filter: null, rules: [], hidden: new Set(), widths: {}, heights: {}, mutations: 0 }); }
  cell(r, c) { const key = `${r},${c}`; if (!this.entries.has(key)) this.entries.set(key, { value: "", formula: "", style: {} }); return this.entries.get(key); }
  getRange(...args) { return new Range(this, ...args); }
  getMaxRows() { return this.rows; } getMaxColumns() { return this.cols; }
  getLastRow() { return Math.max(0, ...[...this.entries].filter(([, cell]) => cell.value !== "" || cell.formula !== "").map(([key]) => Number(key.split(",")[0]))); }
  getLastColumn() { return Math.max(0, ...[...this.entries].filter(([, cell]) => cell.value !== "" || cell.formula !== "").map(([key]) => Number(key.split(",")[1]))); }
  getName() { return "Lamaran Tracker"; } getParent() { return this.parent; }
  getBandings() { return [...this.bands]; } getFilter() { return this.filter; }
  getConditionalFormatRules() { return this.rules; } setConditionalFormatRules(rules) { this.rules = rules; }
  insertRowsAfter(row, count) { this.rows += count; } insertColumnsAfter(col, count) { this.cols += count; }
  setRowHeightsForced(row, count, height) { for (let r = row; r < row + count; r++) this.heights[r] = height; }
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
  assert.equal(sheet.heights[3], 64);
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
  sheet.getRange(2, 5).setValue("Rejected"); ctx.onEdit({ range: sheet.getRange(2, 5) });
  assert.equal(sheet.cell(2, 12).value, frozen);
  sheet.getRange(2, 5).setValue("Applied"); ctx.onEdit({ range: sheet.getRange(2, 5) });
  assert.match(sheet.cell(2, 12).formula, /^=IF/);
});

test("manifest keeps content injection on demand and bundles the shared resolver", () => {
  const manifest = JSON.parse(source("extension/manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.content_scripts, undefined);
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
  assert.match(source("extension/background.js"), /importScripts\("ai-route.js"\)/);
  assert.match(source("extension/popup.html"), /src="ai-route.js"/);
  assert.equal(source("extension/popup.html").includes('id="base-url"'), false);
  assert.equal(source("extension/popup.html").includes('id="model"'), false);
});
