"use strict";

const DEFAULT_SETTINGS = { appsScriptUrl: "" };
const elements = {
  appsScriptUrl: document.getElementById("apps-script-url"),
  saveJob: document.getElementById("save-job"),
  saveStatus: document.getElementById("save-status")
};

let settings = { ...DEFAULT_SETTINGS };
let ready = false;
let busy = false;
let storageQueue = Promise.resolve();

function showStatus(message, kind = "") {
  elements.saveStatus.textContent = message;
  elements.saveStatus.dataset.kind = kind;
}

function renderControls() {
  const disabled = !ready || busy;
  elements.appsScriptUrl.disabled = disabled;
  elements.saveJob.disabled = disabled;
}

function persistSettings(patch) {
  // Antrean menjaga perubahan isian tersimpan sesuai urutan pengetikan.
  const write = storageQueue.then(() => chrome.storage.local.set(patch));
  storageQueue = write.catch((error) => {
    ready = false;
    renderControls();
    showStatus(`Pengaturan gagal disimpan: ${error.message}`, "error");
  });
  return write;
}

async function saveJob() {
  if (!ready || busy) return;
  try {
    if (!settings.appsScriptUrl.trim()) throw new Error("Isi URL web app Apps Script terlebih dahulu.");
    busy = true;
    renderControls();
    showStatus("Mengambil dan menyimpan data lowongan…");
    await storageQueue;
    if (!ready) throw new Error("Pengaturan belum berhasil disimpan.");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.id)) throw new Error("Tab aktif tidak ditemukan.");
    const result = await chrome.runtime.sendMessage({ type: "SAVE_JOB", tabId: tab.id });
    if (!result || !result.ok) throw new Error(result?.error || "Penyimpanan tidak mendapat respons.");
    showStatus(`Tersimpan: ${result.nama_pekerjaan} - ${result.perusahaan}`, "success");
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    busy = false;
    renderControls();
  }
}

async function initialize() {
  try {
    const stored = await chrome.storage.local.get(null);
    settings.appsScriptUrl = typeof stored.appsScriptUrl === "string" ? stored.appsScriptUrl : "";
    // Hanya URL tujuan yang dipakai; bersihkan pengaturan versi lama.
    const obsoleteKeys = Object.keys(stored).filter((key) => !Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key));
    if (obsoleteKeys.length) await chrome.storage.local.remove(obsoleteKeys);
    elements.appsScriptUrl.value = settings.appsScriptUrl;
    ready = true;
    renderControls();
  } catch (error) {
    showStatus(`Pengaturan gagal dimuat: ${error.message}`, "error");
  }
}

elements.appsScriptUrl.addEventListener("input", () => {
  settings.appsScriptUrl = elements.appsScriptUrl.value;
  showStatus("");
  void persistSettings({ appsScriptUrl: settings.appsScriptUrl }).catch(() => {});
});
elements.saveJob.addEventListener("click", saveJob);
void initialize();
