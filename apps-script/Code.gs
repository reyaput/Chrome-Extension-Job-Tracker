/**
 * Cara pasang: buka spreadsheet > Extensions > Apps Script, lalu tempel skrip ini.
 * Simpan dan jalankan setupSheet dari editor, lalu setujui izin akun sendiri.
 * Deploy > New deployment > Web app; Execute as: Me; Who has access: Anyone.
 * Salin URL web app berakhiran /exec ke pengaturan ekstensi.
 */

const SHEET_NAME = "Lamaran Tracker";
const SPREADSHEET_ID_PROPERTY = "TRACKER_SPREADSHEET_ID";
const HEADERS = [
  "Tgl Simpan", "Nama Pekerjaan", "Perusahaan", "Platform", "Status", "Lokasi", "Tipe Kerja",
  "Range Gaji", "Tgl Dilamar", "Deadline", "Sisa Hari (Deadline)", "Lama Menunggu", "Link Lowongan", "Deskripsi"
];
const STATUS_OPTIONS = ["Applied", "Screening", "Interview HR", "Interview User", "Offer", "Rejected"];
const WORK_TYPE_OPTIONS = ["On-site", "WFO", "Hybrid", "Remote", "WFH"];
const MILLISECONDS_PER_DAY = 86400000;

function isTerminalStatus(value) {
  return value === "Offer" || value === "Rejected";
}

function deadlineFormula(row) {
  return '=IF(J' + row + '="","",IF(J' + row + '<TODAY(),"",J' + row + '-TODAY()))';
}

function waitingFormula(row) {
  return '=IF(I' + row + '="","",TODAY()-I' + row + ')';
}

function getHeaderState(sheet) {
  const range = sheet.getRange(1, 1, 1, sheet.getMaxColumns());
  const values = range.getValues()[0];
  const formulas = range.getFormulas()[0];
  if (values.every(function (value) { return value === ""; }) &&
      formulas.every(function (formula) { return formula === ""; })) return "empty";
  const expected = values.length >= HEADERS.length && HEADERS.every(function (header, index) {
    return values[index] === header && formulas[index] === "";
  });
  const extraEmpty = values.slice(HEADERS.length).every(function (value, index) {
    return value === "" && formulas[HEADERS.length + index] === "";
  });
  if (expected && extraEmpty) return "matching";
  throw new Error('Baris 1 tab "' + SHEET_NAME + '" tidak cocok dengan 14 header yang diwajibkan. Tidak ada perubahan; periksa header atau gunakan spreadsheet kosong.');
}

function createStatusValidation() {
  return SpreadsheetApp.newDataValidation().requireValueInList(STATUS_OPTIONS, true).setAllowInvalid(false).build();
}

function createWorkTypeValidation() {
  return SpreadsheetApp.newDataValidation().requireValueInList(WORK_TYPE_OPTIONS, true).setAllowInvalid(false).build();
}

function applyRowFormatting(sheet, firstRow, rowCount) {
  [1, 9, 10].forEach(function (column) {
    sheet.getRange(firstRow, column, rowCount, 1).setNumberFormat("yyyy-mm-dd");
  });
  sheet.getRange(firstRow, 11, rowCount, 2).setNumberFormat("0");
  sheet.getRange(firstRow, 5, rowCount, 1).setDataValidation(createStatusValidation());
  sheet.getRange(firstRow, 7, rowCount, 1).setDataValidation(createWorkTypeValidation());
}

function hasRowData(values, formulas) {
  return values.some(function (value, index) {
    // K dan L tidak dipakai untuk menentukan keberadaan data maupun baris tujuan.
    return index !== 10 && index !== 11 && (value !== "" || formulas[index] !== "");
  });
}

function getExistingRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { values: [], formulas: [] };
  const range = sheet.getRange(2, 1, lastRow - 1, Math.max(HEADERS.length, sheet.getLastColumn()));
  return { values: range.getValues(), formulas: range.getFormulas() };
}

function setupSheet() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Spreadsheet sedang diproses. Jalankan setupSheet kembali setelah beberapa saat.");
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error("Buka Apps Script dari spreadsheet tujuan, lalu jalankan setupSheet dari editor.");
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    // Pemeriksaan header harus selesai sebelum melakukan perubahan apa pun.
    const headerState = sheet ? getHeaderState(sheet) : "empty";
    if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
    if (sheet.getMaxColumns() < HEADERS.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
    }
    if (sheet.getMaxRows() < 2) sheet.insertRowsAfter(sheet.getMaxRows(), 2 - sheet.getMaxRows());
    if (headerState === "empty") sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    applyRowFormatting(sheet, 2, sheet.getMaxRows() - 1);

    const existing = getExistingRows(sheet);
    existing.values.forEach(function (values, index) {
      const formulas = existing.formulas[index];
      if (!hasRowData(values, formulas) || isTerminalStatus(values[4])) return;
      const row = index + 2;
      if (values[10] === "" && formulas[10] === "") sheet.getRange(row, 11).setFormula(deadlineFormula(row));
      if (values[11] === "" && formulas[11] === "") sheet.getRange(row, 12).setFormula(waitingFormula(row));
    });
    SpreadsheetApp.flush();
    // Web app tidak memiliki konteks spreadsheet aktif; ID asal direkam oleh setup.
    PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_PROPERTY, spreadsheet.getId());
  } finally {
    lock.releaseLock();
  }
}

function getTrackerSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY);
  if (!id) throw new Error("Jalankan setupSheet dari editor Apps Script di spreadsheet tujuan sebelum memakai web app.");
  return SpreadsheetApp.openById(id);
}

function textValue(value) {
  return typeof value === "string" ? value : "";
}

function normalizeWorkType(value) {
  const normalized = textValue(value).trim().replace(/\s+/g, " ").toLowerCase();
  const types = {
    "on-site": "On-site", "on site": "On-site", onsite: "On-site",
    wfo: "WFO", "work from office": "WFO", hybrid: "Hybrid", remote: "Remote",
    wfh: "WFH", "work from home": "WFH"
  };
  return Object.prototype.hasOwnProperty.call(types, normalized) ? types[normalized] : "";
}

function parseDateOnly(value, timeZone) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  try {
    const date = Utilities.parseDate(value, timeZone, "yyyy-MM-dd");
    return Utilities.formatDate(date, timeZone, "yyyy-MM-dd") === value ? date : null;
  } catch (error) {
    return null;
  }
}

function getToday(timeZone) {
  return Utilities.parseDate(Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd"), timeZone, "yyyy-MM-dd");
}

function writePlainText(sheet, row, column, values) {
  const richValues = values.map(function (value) {
    // RichTextValue menulis teks literal, termasuk awalan =, +, -, @, tanpa rumus.
    return SpreadsheetApp.newRichTextValue().setText(textValue(value)).build();
  });
  sheet.getRange(row, column, 1, values.length).setNumberFormat("@").setRichTextValues([richValues]);
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let lock;
  let locked = false;
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error("Body permintaan JSON kosong.");
    let data;
    try { data = JSON.parse(e.postData.contents); } catch (error) { throw new Error("Body permintaan bukan JSON yang valid."); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Body permintaan harus berupa satu objek JSON.");
    lock = LockService.getScriptLock();
    locked = lock.tryLock(10000);
    if (!locked) throw new Error("Spreadsheet sedang menerima permintaan lain. Coba kembali setelah beberapa saat.");

    const spreadsheet = getTrackerSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Tab "' + SHEET_NAME + '" tidak ada. Jalankan setupSheet dari editor Apps Script.');
    if (getHeaderState(sheet) !== "matching") throw new Error("Header belum disiapkan. Jalankan setupSheet dari editor Apps Script.");
    const existing = getExistingRows(sheet);
    let lastDataRow = 1;
    for (let index = existing.values.length - 1; index >= 0; index -= 1) {
      if (hasRowData(existing.values[index], existing.formulas[index])) {
        lastDataRow = index + 2;
        break;
      }
    }
    const row = lastDataRow + 1;
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), row - sheet.getMaxRows());
    const timeZone = spreadsheet.getSpreadsheetTimeZone();
    const today = getToday(timeZone);
    const deadline = parseDateOnly(data.deadline, timeZone);

    // Tidak ada teks dari halaman yang melewati setValues; hanya nilai buatan skrip.
    sheet.getRange(row, 1, 1, HEADERS.length).setValues([
      [today, "", "", "", "Applied", "", "", "", today, deadline || "", "", "", "", ""]
    ]);
    writePlainText(sheet, row, 2, [data.nama_pekerjaan, data.perusahaan, data.platform]);
    writePlainText(sheet, row, 6, [data.lokasi, normalizeWorkType(data.tipe_kerja), data.range_gaji]);
    writePlainText(sheet, row, 13, [data.link, data.deskripsi]);
    sheet.getRange(row, 11, 1, 2).setFormulas([[deadlineFormula(row), waitingFormula(row)]]);
    applyRowFormatting(sheet, row, 1);
    SpreadsheetApp.flush();
    return jsonResponse({ ok: true, row: row });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || String(error) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function getCalendarDay(date, timeZone) {
  const isoDate = Utilities.formatDate(date, timeZone, "yyyy-MM-dd");
  return Date.parse(isoDate + "T00:00:00Z") / MILLISECONDS_PER_DAY;
}

function onEdit(e) {
  if (!e || !e.range) return;
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== SHEET_NAME || range.getColumn() > 5 || range.getLastColumn() < 5 || range.getLastRow() < 2) return;
  const firstRow = Math.max(2, range.getRow());
  const rowCount = range.getLastRow() - firstRow + 1;
  const statuses = sheet.getRange(firstRow, 5, rowCount, 1).getValues();
  const datesAndWaiting = sheet.getRange(firstRow, 9, rowCount, 4);
  const values = datesAndWaiting.getValues();
  const formulas = datesAndWaiting.getFormulas();
  const timeZone = sheet.getParent().getSpreadsheetTimeZone();
  const todayDay = getCalendarDay(new Date(), timeZone);

  statuses.forEach(function (status, index) {
    const cell = sheet.getRange(firstRow + index, 12);
    const formula = formulas[index][3];
    if (isTerminalStatus(status[0])) {
      if (!formula || values[index][0] === "") return;
      const appliedDate = values[index][0] instanceof Date ? values[index][0] : parseDateOnly(values[index][0], timeZone);
      if (!appliedDate || Number.isNaN(appliedDate.getTime())) return;
      cell.setValue(Math.round(todayDay - getCalendarDay(appliedDate, timeZone)));
    } else if (!formula) {
      cell.setFormula(waitingFormula(firstRow + index));
    }
  });
}
