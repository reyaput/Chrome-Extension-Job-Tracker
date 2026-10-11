"use strict";

const MAX_DESCRIPTION_CHARS = 1500;
const REQUEST_TIMEOUT_MS = 25000;
const DEFAULT_SETTINGS = {
  appsScriptUrl: ""
};

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanText(value) {
  return textValue(value).replace(/\s+/g, " ");
}

function normalizeWorkType(value) {
  const types = {
    "on-site": "On-site", "on site": "On-site", onsite: "On-site",
    wfo: "WFO", "work from office": "WFO",
    hybrid: "Hybrid", remote: "Remote",
    wfh: "WFH", "work from home": "WFH"
  };
  const normalized = cleanText(value).toLowerCase();
  return Object.prototype.hasOwnProperty.call(types, normalized) ? types[normalized] : "";
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeSourceDeadline(value) {
  const text = textValue(value);
  if (isValidIsoDate(text)) return text;
  // Tanggal ISO bertimestamp memakai bagian tanggal yang tertulis di sumber.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text) && !Number.isNaN(Date.parse(text))) {
    const datePart = text.slice(0, 10);
    if (isValidIsoDate(datePart)) return datePart;
  }
  // Nama bulan dan tahun eksplisit tidak ambigu; jangan menebak tahun yang hilang.
  const months = {
    jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2,
    mar: 3, march: 3, maret: 3, apr: 4, april: 4, may: 5, mei: 5,
    jun: 6, june: 6, juni: 6, jul: 7, july: 7, juli: 7,
    aug: 8, august: 8, agu: 8, agustus: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, okt: 10, oktober: 10, nov: 11, november: 11,
    dec: 12, december: 12, des: 12, desember: 12
  };
  const dayFirst = text.match(/^(\d{1,2})\s+([a-z]+)\.?\s*,?\s*(\d{4})$/i);
  const monthFirst = text.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (dayFirst || monthFirst) {
    const month = months[(dayFirst?.[2] || monthFirst[1]).toLowerCase()];
    const day = dayFirst?.[1] || monthFirst[2];
    const year = dayFirst?.[3] || monthFirst[3];
    const iso = `${year}-${String(month || 0).padStart(2, "0")}-${day.padStart(2, "0")}`;
    if (isValidIsoDate(iso)) return iso;
  }
  return "";
}

function getPlatform(hostname) {
  const host = hostname.toLowerCase();
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "LinkedIn";
  const labels = host.split(".");
  const platforms = { jobstreet: "JobStreet", glints: "Glints", kalibrr: "Kalibrr", indeed: "Indeed" };
  for (const [brand, platform] of Object.entries(platforms)) {
    if (labels.includes(brand)) return platform;
  }
  return "Website Perusahaan";
}

function getLocationText(jobLocation) {
  const locations = Array.isArray(jobLocation) ? jobLocation : [jobLocation];
  return locations.map((location) => {
    const address = location?.address || {};
    const country = typeof address.addressCountry === "string"
      ? address.addressCountry : address.addressCountry?.name;
    const parts = [address.addressLocality, address.addressRegion, country].map(cleanText).filter(Boolean);
    return [...new Set(parts)].join(", ");
  }).filter(Boolean).join("; ");
}

function getSalaryText(baseSalary) {
  // Nilai angka JSON-LD tidak dirangkai menjadi rentang gaji yang belum tentu tampil di halaman.
  if (typeof baseSalary === "string") return textValue(baseSalary);
  if (typeof baseSalary?.value === "string") return textValue(baseSalary.value);
  return "";
}

function extractPostFields(value) {
  const text = textValue(value).replace(/\r\n?/g, "\n");
  const lines = text.split("\n").map((line) => cleanText(line)
    .replace(/^[^\p{L}\p{N}]+/u, "").replace(/^\d+[.)]\s*/, ""));
  const labeled = (labels) => {
    const pattern = new RegExp(`^(?:${labels})\\s*[:：]\\s*(.+)$`, "i");
    return lines.map((line) => line.match(pattern)?.[1] || "").find(Boolean) || "";
  };
  const positions = [];
  const heading = lines.findIndex((line) => /^(?:available positions|open positions|posisi (?:yang )?tersedia|lowongan tersedia)\s*[:：]?$/i.test(line));
  if (heading >= 0) {
    for (const line of lines.slice(heading + 1)) {
      if (!line) { if (positions.length) break; else continue; }
      if (/^apply\s*:/i.test(line)) continue;
      if (line.length > 90 || /[:：#]|https?:\/\//i.test(line) ||
          /^(?:explore|please|application|qualifications|requirements|placement|location|deadline)\b/i.test(line)) break;
      positions.push(line);
      if (positions.length === 30) break;
    }
  }
  const companySentence = lines.map((line) => line.match(/^(.{2,100}?)\s+is\s+(?:still\s+)?(?:looking for|hiring|recruiting)\b/i)?.[1] || "").find(Boolean);
  const locationSentence = lines.map((line) => line.match(/\bjoin our (?:growing )?team in ([^.!?\n]{2,100})[.!?]?$/i)?.[1] || "").find(Boolean);
  return {
    nama_pekerjaan: labeled("job title|position|posisi|role|jabatan") || [...new Set(positions)].join("; ") || "Posting lowongan LinkedIn",
    perusahaan: labeled("company|hiring company|perusahaan|nama perusahaan") || companySentence || "",
    lokasi: labeled("location|placement|penempatan|lokasi") || locationSentence || "",
    tipe_kerja: normalizeWorkType(labeled("work type|workplace|work arrangement|tipe kerja")),
    range_gaji: labeled("salary|compensation|gaji|range gaji"),
    deadline: normalizeSourceDeadline(labeled("application deadline|apply before|deadline|batas (?:akhir )?(?:lamaran|pendaftaran)")),
    deskripsi: cleanText(text).slice(0, MAX_DESCRIPTION_CHARS)
  };
}

function usableMetadata(value, hostname) {
  const text = cleanText(value);
  const platform = getPlatform(hostname);
  if (platform === "Website Perusahaan") return text;
  const normalized = text.toLowerCase().replace(/[|:–—-]/g, " ").replace(/\s+/g, " ").trim();
  const brand = platform.toLowerCase();
  if (normalized === brand || (brand === "kalibrr" && normalized === "kalibrr where jobs find you") ||
      /^(?:posting|post|feed|sign in|log in|login|masuk) linkedin$/.test(normalized) ||
      /^linkedin (?:posting|post|feed|sign in|log in|login|masuk|log in or sign up)$/.test(normalized)) return "";
  return text;
}

function extractJobData(page) {
  if (page.pageKind === "linkedin-post") return extractPostFields(page.post?.text);
  const job = page.jobPostings[0] || {};
  const fields = page.siteFields;
  const locationTypes = Array.isArray(job.jobLocationType) ? job.jobLocationType : [job.jobLocationType];
  const structuredWorkType = locationTypes.includes("TELECOMMUTE") ? "Remote" : "";
  return {
    nama_pekerjaan: cleanText(job.title) || cleanText(fields.title) || usableMetadata(page.meta.ogTitle, page.hostname) || usableMetadata(page.title, page.hostname),
    perusahaan: cleanText(job.hiringOrganization?.name) || cleanText(fields.company) || usableMetadata(page.meta.ogSiteName, page.hostname),
    lokasi: getLocationText(job.jobLocation) || textValue(fields.location),
    tipe_kerja: structuredWorkType || normalizeWorkType(fields.workType),
    range_gaji: getSalaryText(job.baseSalary) || textValue(fields.salary),
    deadline: normalizeSourceDeadline(job.validThrough) || normalizeSourceDeadline(fields.deadline),
    deskripsi: cleanText(job.description || fields.description || usableMetadata(page.meta.description, page.hostname) || usableMetadata(page.meta.ogDescription, page.hostname))
      .slice(0, MAX_DESCRIPTION_CHARS)
  };
}

async function fetchWithTimeout(url, options, target) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const body = await response.text();
    return { response, body };
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error(`Waktu tunggu ${target} habis setelah 25 detik: ${error.message}`);
    }
    throw new Error(`Kesalahan jaringan ke ${target}: ${error.message}`);
  }
}

function validatePageUrl(value) {
  let url;
  try { url = new URL(value); } catch {
    throw new Error("Alamat halaman lowongan belum tersedia atau tidak valid. Tunggu halaman selesai dimuat, lalu tutup dan buka kembali ekstensi lewat ikon di toolbar Chrome.");
  }
  const webStore = url.hostname === "chromewebstore.google.com" ||
    (url.hostname === "chrome.google.com" && /^\/webstore(?:\/|$)/.test(url.pathname));
  if (!["http:", "https:"].includes(url.protocol) || webStore) {
    throw new Error("Halaman ini tidak boleh diambil datanya. Buka halaman lowongan http:// atau https://; halaman internal Chrome dan Web Store tidak didukung.");
  }
}

function validateAppsScriptUrl(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error("URL web app Apps Script tidak valid."); }
  if (url.protocol !== "https:" || url.hostname !== "script.google.com" ||
      !/^\/macros\/(?:u\/\d+\/)?s\/[^/]+\/exec$/.test(url.pathname) || url.username || url.password) {
    throw new Error("Gunakan URL deployment web app Apps Script dari script.google.com yang berakhir dengan /exec, bukan URL editor atau /dev.");
  }
  return value.trim();
}

async function postToSheet(url, data) {
  const { response, body } = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(data),
    redirect: "follow"
  }, "Apps Script");
  let result;
  try {
    result = JSON.parse(body);
  } catch {
    throw new Error(`Respons Apps Script bukan JSON (HTTP ${response.status}). Pastikan URL web app berakhir /exec dan akses deployment adalah Anyone (Siapa saja).`);
  }
  if (!response.ok) throw new Error(`Apps Script membalas HTTP ${response.status}: ${result?.error || body}`);
  if (result?.ok !== true || !Number.isInteger(result.row) || result.row < 2) {
    throw new Error(textValue(result?.error) || "Respons Apps Script tidak memuat hasil penyimpanan yang valid.");
  }
  return result;
}

async function saveJob(tabId) {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  if (!textValue(settings.appsScriptUrl)) throw new Error("Isi URL web app Apps Script terlebih dahulu.");
  const appsScriptUrl = validateAppsScriptUrl(settings.appsScriptUrl);
  if (!Number.isInteger(tabId)) throw new Error("Tab aktif tidak ditemukan.");
  const tab = await chrome.tabs.get(tabId);
  // URL adalah metadata opsional pada tabs.Tab. Jika tidak diberikan Chrome,
  // coba injeksi dengan izin yang sudah ada dan validasi location.href hasilnya.
  if (textValue(tab.url)) validatePageUrl(tab.url);
  let results;
  try {
    results = await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (error) {
    throw new Error("Chrome tidak bisa membaca halaman lowongan ini. Buka halaman detail lowongan http/https, " +
      "tunggu selesai dimuat, lalu tutup dan buka kembali ekstensi lewat ikon Lamaran Tracker di toolbar Chrome. " +
      "Jika ekstensi baru dimuat ulang, refresh halaman lowongan. Halaman internal Chrome dan Web Store tidak didukung. " +
      `Detail Chrome: ${error.message}`);
  }
  const page = results?.[0]?.result;
  if (!page) throw new Error("Halaman tidak mengembalikan data lowongan.");
  validatePageUrl(page.url);
  if (page.extractionError) throw new Error(page.extractionError);
  if (!page.hasPageText && !page.jobPostings.length && !Object.values(page.siteFields).some(textValue)) {
    throw new Error("Halaman kosong atau detail lowongan belum dimuat. Tunggu sampai detail lowongan tampil, lalu coba kembali.");
  }
  const fields = extractJobData(page);
  if (!fields.nama_pekerjaan) {
    throw new Error("Nama pekerjaan belum ditemukan pada halaman ini. Tunggu detail lowongan selesai dimuat dan buka halaman detailnya. Judul platform saja tidak akan disimpan sebagai lowongan.");
  }
  const data = { ...fields, platform: getPlatform(page.hostname), link: page.url };
  const result = await postToSheet(appsScriptUrl, data);
  return { ok: true, row: result.row, nama_pekerjaan: data.nama_pekerjaan, perusahaan: data.perusahaan };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type !== "SAVE_JOB") return false;
  const task = saveJob(message.tabId);
  // Proses tetap berjalan di service worker jika popup ditutup.
  task.then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
