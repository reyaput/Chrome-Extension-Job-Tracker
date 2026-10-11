"use strict";

const DEFAULT_SETTINGS = {
  apiKey: "",
  modelRoute: "",
  appsScriptUrl: "",
  mode: "manual",
  aiVerified: false
};

const elements = {
  apiKey: document.getElementById("api-key"),
  modelRoute: document.getElementById("model-route"),
  routeInfo: document.getElementById("route-info"),
  appsScriptUrl: document.getElementById("apps-script-url"),
  aiMode: document.getElementById("ai-mode"),
  manualMode: document.getElementById("manual-mode"),
  modeHelp: document.getElementById("mode-help"),
  checkConnection: document.getElementById("check-connection"),
  connectionStatus: document.getElementById("connection-status"),
  saveJob: document.getElementById("save-job"),
  saveStatus: document.getElementById("save-status")
};

let settings = { ...DEFAULT_SETTINGS };
let ready = false;
let busy = false;
let storageQueue = Promise.resolve();

function showStatus(element, message, kind = "") {
  element.textContent = message;
  element.dataset.kind = kind;
}

function renderControls() {
  const disabled = !ready || busy;
  for (const key of ["apiKey", "modelRoute", "appsScriptUrl"]) {
    elements[key].disabled = disabled;
  }
  elements.aiMode.disabled = disabled || !settings.aiVerified;
  elements.manualMode.disabled = disabled;
  elements.checkConnection.disabled = disabled;
  elements.saveJob.disabled = disabled;
  elements.aiMode.setAttribute("aria-pressed", String(settings.mode === "ai"));
  elements.manualMode.setAttribute("aria-pressed", String(settings.mode === "manual"));
  elements.modeHelp.textContent = settings.aiVerified
    ? "Koneksi terverifikasi. AI merangkum lowongan; Manual mengambil data tanpa AI."
    : "Mode AI terkunci sampai Cek Koneksi berhasil. Manual mengambil data tanpa AI.";
}

function persistSettings(patch) {
  // Antrean menjaga perubahan isian tetap tersimpan sesuai urutan pengetikan.
  const write = storageQueue.then(() => chrome.storage.local.set(patch));
  storageQueue = write.catch((error) => {
    ready = false;
    renderControls();
    showStatus(elements.saveStatus, `Pengaturan gagal disimpan: ${error.message}`, "error");
  });
  return write;
}

function updateAiSettings() {
  settings.apiKey = elements.apiKey.value;
  settings.modelRoute = elements.modelRoute.value;
  settings.aiVerified = false;
  settings.mode = "manual";
  showStatus(elements.connectionStatus, "Pengaturan berubah. Jalankan Cek Koneksi kembali.");
  showStatus(elements.saveStatus, "");
  renderControls();
  renderRouteInfo();
  void persistSettings({
    apiKey: settings.apiKey,
    modelRoute: settings.modelRoute,
    aiVerified: false,
    mode: "manual"
  }).catch(() => {});
}

function selectMode(mode) {
  if (!ready || busy || (mode === "ai" && !settings.aiVerified)) return;
  settings.mode = mode;
  renderControls();
  void persistSettings({ mode }).catch(() => {});
}

function renderRouteInfo() {
  try {
    const route = AiRoutes.resolve(settings.modelRoute);
    elements.routeInfo.textContent = `Tujuan: ${route.name} · ${route.model}`;
  } catch {
    elements.routeInfo.textContent = "Pilih penyedia lewat rute. Tidak perlu mengisi URL dasar atau nama model terpisah.";
  }
}

async function checkConnection() {
  if (!ready || busy) return;
  try {
    if (!settings.apiKey.trim()) throw new Error("Isi Kunci API milik penyedia pada rute yang dipilih.");
    const route = AiRoutes.resolve(settings.modelRoute);
    // Permintaan izin dipanggil langsung dari klik, sebelum penantian lainnya.
    const permissionRequest = chrome.permissions.request({ origins: [route.permissionOrigin] });
    busy = true;
    settings.aiVerified = false;
    settings.mode = "manual";
    renderControls();
    showStatus(elements.connectionStatus, "Meminta izin dan memeriksa koneksi…");
    showStatus(elements.saveStatus, "");
    const resetWrite = persistSettings({ aiVerified: false, mode: "manual" });
    const [granted] = await Promise.all([permissionRequest, resetWrite]);
    if (!granted) throw new Error("Izin akses ke penyedia AI ditolak. Izinkan akses melalui tombol Cek Koneksi.");

    const result = await chrome.runtime.sendMessage({ type: "CHECK_AI" });
    if (!result || !result.ok) throw new Error(result?.error || "Pemeriksaan koneksi tidak mendapat respons.");
    settings.aiVerified = true;
    showStatus(elements.connectionStatus, `Koneksi berhasil ke ${result.provider || route.name}. Mode AI sudah dapat dipilih.`, "success");
  } catch (error) {
    settings.aiVerified = false;
    settings.mode = "manual";
    await persistSettings({ aiVerified: false, mode: "manual" }).catch(() => {});
    showStatus(elements.connectionStatus, error.message, "error");
  } finally {
    busy = false;
    renderControls();
  }
}

async function saveJob() {
  if (!ready || busy) return;
  try {
    if (!settings.appsScriptUrl.trim()) throw new Error("Isi URL web app Apps Script terlebih dahulu.");
    if (settings.mode === "ai" && !settings.aiVerified) {
      throw new Error("Mode AI belum terverifikasi. Jalankan Cek Koneksi terlebih dahulu.");
    }
    busy = true;
    renderControls();
    showStatus(elements.saveStatus, "Mengambil dan menyimpan data lowongan…");
    await storageQueue;
    if (!ready) throw new Error("Pengaturan belum berhasil disimpan.");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.id)) throw new Error("Tab aktif tidak ditemukan.");
    const result = await chrome.runtime.sendMessage({ type: "SAVE_JOB", tabId: tab.id, mode: settings.mode });
    if (!result || !result.ok) throw new Error(result?.error || "Penyimpanan tidak mendapat respons.");
    showStatus(elements.saveStatus, `Tersimpan: ${result.nama_pekerjaan} - ${result.perusahaan}`, "success");
  } catch (error) {
    showStatus(elements.saveStatus, error.message, "error");
  } finally {
    busy = false;
    renderControls();
  }
}

async function initialize() {
  try {
    const stored = await chrome.storage.local.get(null);
    const migrated = typeof stored.modelRoute !== "string";
    settings = { ...DEFAULT_SETTINGS, ...stored, modelRoute: AiRoutes.migrateLegacySettings(stored) };
    if (migrated) settings.aiVerified = false;
    if (settings.mode !== "ai" || !settings.aiVerified) settings.mode = "manual";
    for (const key of ["apiKey", "modelRoute", "appsScriptUrl"]) {
      elements[key].value = settings[key];
    }
    await persistSettings({ modelRoute: settings.modelRoute, aiVerified: settings.aiVerified, mode: settings.mode });
    await chrome.storage.local.remove(["baseUrl", "model"]);
    ready = true;
    if (settings.aiVerified) {
      showStatus(elements.connectionStatus, "Koneksi sudah terverifikasi untuk pengaturan ini.", "success");
    } else if (migrated && settings.modelRoute) {
      showStatus(elements.connectionStatus, "Pengaturan lama dipindahkan ke Rute model. Klik Cek Koneksi untuk memverifikasi kembali.");
    }
    renderRouteInfo();
    renderControls();
  } catch (error) {
    showStatus(elements.saveStatus, `Pengaturan gagal dimuat: ${error.message}`, "error");
  }
}

for (const key of ["apiKey", "modelRoute"]) elements[key].addEventListener("input", updateAiSettings);
elements.appsScriptUrl.addEventListener("input", () => {
  settings.appsScriptUrl = elements.appsScriptUrl.value;
  showStatus(elements.saveStatus, "");
  void persistSettings({ appsScriptUrl: settings.appsScriptUrl }).catch(() => {});
});
elements.aiMode.addEventListener("click", () => selectMode("ai"));
elements.manualMode.addEventListener("click", () => selectMode("manual"));
elements.checkConnection.addEventListener("click", checkConnection);
elements.saveJob.addEventListener("click", saveJob);
void initialize();
