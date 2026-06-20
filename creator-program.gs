/**
 * MAISON D'VUE — Founding Creator Program backend (Google Apps Script)
 * ---------------------------------------------------------------------------
 * A single Web App that powers the creator program with a Google Sheet as the
 * data store — the same lightweight pattern the boutique already uses for its
 * reservation waitlist. No server to maintain, no database to provision.
 *
 *   POST  (form fields)                         → record a new application
 *   GET   ?action=dashboard&code=CODE           → a creator's dashboard figures
 *
 * The Google Sheet itself IS the admin dashboard: the founder reviews, approves,
 * and tracks everything from the rows. Changing an applicant's Status to
 * "Approved" automatically mints their affiliate code and referral link.
 *
 * ── DEPLOY ──────────────────────────────────────────────────────────────────
 *  1. Create a Google Sheet. Note its ID from the URL
 *     (https://docs.google.com/spreadsheets/d/<THIS_IS_THE_ID>/edit).
 *  2. Extensions ▸ Apps Script. Paste this file in. Set SHEET_ID below.
 *  3. Run `setup` once (Run ▸ setup) and authorize. It builds the tabs and
 *     installs the on-edit trigger that mints codes on approval.
 *  4. Deploy ▸ New deployment ▸ Web app.
 *       Execute as: Me   |   Who has access: Anyone
 *     Copy the Web App URL.
 *  5. Paste that URL into APPLICATION_ENDPOINT in creators.html and
 *     DASHBOARD_ENDPOINT in creator-dashboard.html.
 * ---------------------------------------------------------------------------
 */

// ── Configuration ────────────────────────────────────────────────────────────
var SHEET_ID = "REPLACE_WITH_GOOGLE_SHEET_ID";

// Where verified purchases send shoppers. The creator's code is appended as ?ref=.
var SHOP_BASE_URL = "https://shop.maisondvue.com/";

// Notify the House when a new application arrives ("" to disable).
var NOTIFY_EMAIL = "hello@maisondvue.com";

// Commission rate by status / tier. Advancement is set by editing Status.
var COMMISSION_RATES = {
  "Applied": 0,
  "Approved": 0.20,
  "Product Sent": 0.20,
  "Active Affiliate": 0.20,
  "Founding Creator": 0.20,
  "House Ambassador": 0.25,
  "Founder Circle": 0.30
};

// The status values offered as a dropdown in the sheet.
var STATUS_OPTIONS = [
  "Applied", "Approved", "Product Sent",
  "Active Affiliate", "House Ambassador", "Founder Circle"
];

var APPLICATIONS_TAB = "Applications";
var SALES_TAB = "Sales";
var DASHBOARD_TAB = "Admin Dashboard";

var APP_HEADERS = [
  "Application Date", "First Name", "Last Name", "Email",
  "Instagram", "TikTok", "Follower Count", "Shipping Address",
  "Note", "Status", "Creator Code", "Referral Link",
  "Total Sales", "Total Revenue", "Commission Owed", "Source"
];

var SALES_HEADERS = ["Date", "Creator Code", "Order ID", "Order Value", "Status"];

// ── HTTP entry points ─────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var p = (e && e.parameter) || {};

    // Honeypot — silently accept and discard.
    if (p.website) return json({ ok: true });

    var email = String(p.email || "").trim().toLowerCase();
    if (!email || email.indexOf("@") === -1) {
      return json({ ok: false, error: "A valid email is required." });
    }

    var sheet = tab(APPLICATIONS_TAB, APP_HEADERS);

    sheet.appendRow([
      new Date(),
      clean(p.firstName),
      clean(p.lastName),
      email,
      clean(p.instagram),
      clean(p.tiktok),
      clean(p.followers),
      clean(p.shipping, 500),
      clean(p.note, 1000),
      "Applied",
      "",            // Creator Code — minted on approval
      "",            // Referral Link — minted on approval
      0,             // Total Sales
      0,             // Total Revenue
      0,             // Commission Owed
      clean(p.source) || "creators-page"
    ]);

    if (NOTIFY_EMAIL) {
      try {
        MailApp.sendEmail(
          NOTIFY_EMAIL,
          "New Founding Creator application — " + clean(p.firstName) + " " + clean(p.lastName),
          [
            "A new application has been received.",
            "",
            "Name: " + clean(p.firstName) + " " + clean(p.lastName),
            "Email: " + email,
            "Instagram: " + clean(p.instagram),
            "TikTok: " + clean(p.tiktok),
            "Followers: " + clean(p.followers),
            "",
            "Review and approve in the program sheet."
          ].join("\n")
        );
      } catch (mailErr) { /* notification is best-effort */ }
    }

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === "dashboard") return dashboardForCode(p.code);
  return json({ ok: true, service: "MAISON D'VUE Founding Creator Program" });
}

// ── Dashboard read ──────────────────────────────────────────────────────────
function dashboardForCode(code) {
  code = String(code || "").trim().toUpperCase();
  if (!code) return json({ ok: false, error: "No code provided." });

  var sheet = tab(APPLICATIONS_TAB, APP_HEADERS);
  var rows = sheet.getDataRange().getValues();
  var col = headerIndex(rows[0]);

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][col["Creator Code"]]).trim().toUpperCase() === code) {
      var status = String(rows[i][col["Status"]]).trim();
      var rate = COMMISSION_RATES[status] != null ? COMMISSION_RATES[status] : 0.20;
      var totals = salesTotals(code);
      return json({
        ok: true,
        name: [rows[i][col["First Name"]], rows[i][col["Last Name"]]].join(" ").trim(),
        status: status,
        tier: tierFromStatus(status),
        commissionRate: Math.round(rate * 100) + "%",
        creatorCode: code,
        affiliateLink: rows[i][col["Referral Link"]] || (SHOP_BASE_URL + "?ref=" + code),
        totalSales: totals.count,
        totalRevenue: totals.revenue,
        commissionEarned: Math.round(totals.revenue * rate * 100) / 100
      });
    }
  }
  return json({ ok: false, error: "Code not found." });
}

// ── On-edit: mint code + link the moment Status becomes "Approved" ────────────
// Installed by `setup`. Fires whenever a Status cell is edited.
function onStatusEdit(e) {
  try {
    var sh = e.range.getSheet();
    if (sh.getName() !== APPLICATIONS_TAB) return;

    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var col = headerIndex(headers);
    var statusCol = col["Status"] + 1;
    if (e.range.getColumn() !== statusCol || e.range.getRow() < 2) return;

    var row = e.range.getRow();
    var status = String(e.range.getValue()).trim();
    var codeCell = sh.getRange(row, col["Creator Code"] + 1);
    var linkCell = sh.getRange(row, col["Referral Link"] + 1);

    // Mint a code on first advancement past "Applied" if none exists yet.
    var minting = status && status !== "Applied" && !String(codeCell.getValue()).trim();
    if (minting) {
      var first = String(sh.getRange(row, col["First Name"] + 1).getValue());
      var last = String(sh.getRange(row, col["Last Name"] + 1).getValue());
      var code = generateCode(first, last, sh, col);
      codeCell.setValue(code);
      linkCell.setValue(SHOP_BASE_URL + "?ref=" + code);
    }

    refreshTotalsRow(sh, row, col);
  } catch (err) { /* never block the edit */ }
}

// ── Code generation ───────────────────────────────────────────────────────────
function generateCode(first, last, sh, col) {
  var base = String(first || "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 8);
  if (!base) base = String(last || "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 8);
  if (!base) base = "CREATOR";

  var existing = {};
  var codes = sh.getRange(2, col["Creator Code"] + 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  codes.forEach(function (r) { if (r[0]) existing[String(r[0]).toUpperCase()] = true; });

  // First try a clean BASE10-style code, then add a random suffix if taken.
  var candidate = base + "10";
  if (existing[candidate]) {
    do {
      candidate = base + Math.floor(100 + Math.random() * 900);
    } while (existing[candidate]);
  }
  return candidate;
}

// ── Sales aggregation ─────────────────────────────────────────────────────────
function salesTotals(code) {
  var sheet = tab(SALES_TAB, SALES_HEADERS);
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { count: 0, revenue: 0 };
  var col = headerIndex(rows[0]);
  var count = 0, revenue = 0;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][col["Creator Code"]]).trim().toUpperCase() !== code) continue;
    var status = String(rows[i][col["Status"]] || "").trim().toLowerCase();
    if (status === "refunded" || status === "cancelled" || status === "voided") continue;
    count++;
    revenue += Number(rows[i][col["Order Value"]]) || 0;
  }
  return { count: count, revenue: Math.round(revenue * 100) / 100 };
}

// Writes the cached Total Sales / Revenue / Commission back onto an application
// row so the founder sees live figures in the sheet without opening anything.
function refreshTotalsRow(sh, row, col) {
  var code = String(sh.getRange(row, col["Creator Code"] + 1).getValue()).trim().toUpperCase();
  var status = String(sh.getRange(row, col["Status"] + 1).getValue()).trim();
  var rate = COMMISSION_RATES[status] != null ? COMMISSION_RATES[status] : 0.20;
  var t = code ? salesTotals(code) : { count: 0, revenue: 0 };
  sh.getRange(row, col["Total Sales"] + 1).setValue(t.count);
  sh.getRange(row, col["Total Revenue"] + 1).setValue(t.revenue);
  sh.getRange(row, col["Commission Owed"] + 1).setValue(Math.round(t.revenue * rate * 100) / 100);
}

// Recompute every creator's totals + the admin summary. Run on a daily trigger,
// or by hand after importing sales, to keep the sheet current.
function refreshAllTotals() {
  var sh = tab(APPLICATIONS_TAB, APP_HEADERS);
  var rows = sh.getDataRange().getValues();
  var col = headerIndex(rows[0]);
  for (var i = 1; i < rows.length; i++) refreshTotalsRow(sh, i + 1, col);
  buildDashboard();
}

// ── Admin summary tab ─────────────────────────────────────────────────────────
function buildDashboard() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var apps = tab(APPLICATIONS_TAB, APP_HEADERS).getDataRange().getValues();
  var col = headerIndex(apps[0]);

  var totalApps = apps.length - 1;
  var counts = {};
  STATUS_OPTIONS.forEach(function (s) { counts[s] = 0; });
  var productSent = 0, totalRevenue = 0, totalCommission = 0;
  var performers = [];

  for (var i = 1; i < apps.length; i++) {
    var status = String(apps[i][col["Status"]]).trim();
    if (counts[status] != null) counts[status]++;
    if (status === "Product Sent") productSent++;
    var rev = Number(apps[i][col["Total Revenue"]]) || 0;
    var comm = Number(apps[i][col["Commission Owed"]]) || 0;
    totalRevenue += rev;
    totalCommission += comm;
    if (apps[i][col["Creator Code"]]) {
      performers.push({
        name: [apps[i][col["First Name"]], apps[i][col["Last Name"]]].join(" ").trim(),
        code: apps[i][col["Creator Code"]],
        revenue: rev, commission: comm
      });
    }
  }

  var approved = counts["Approved"] + counts["Active Affiliate"] +
    counts["House Ambassador"] + counts["Founder Circle"];
  performers.sort(function (a, b) { return b.revenue - a.revenue; });

  var dash = ss.getSheetByName(DASHBOARD_TAB) || ss.insertSheet(DASHBOARD_TAB);
  dash.clear();
  var out = [
    ["MAISON D'VUE — Founding Creator Program", ""],
    ["Last refreshed", new Date()],
    ["", ""],
    ["Applications", totalApps],
    ["Approvals", approved],
    ["Product shipments", productSent],
    ["Active affiliates", counts["Active Affiliate"] + counts["House Ambassador"] + counts["Founder Circle"]],
    ["Total revenue generated", totalRevenue],
    ["Commission owed", totalCommission],
    ["", ""],
    ["Top performing creators", ""],
    ["Creator", "Code", "Revenue", "Commission"]
  ];
  performers.slice(0, 10).forEach(function (p) {
    out.push([p.name, p.code, p.revenue, p.commission]);
  });
  dash.getRange(1, 1, out.length, 4 < out[0].length ? out[0].length : 4)
    .setValues(out.map(function (r) { while (r.length < 4) r.push(""); return r; }));
  dash.getRange("A1").setFontWeight("bold").setFontSize(14);
  dash.getRange("A12:D12").setFontWeight("bold");
  dash.setColumnWidth(1, 240);
}

// ── One-time setup ────────────────────────────────────────────────────────────
function setup() {
  tab(APPLICATIONS_TAB, APP_HEADERS);
  tab(SALES_TAB, SALES_HEADERS);

  // Status dropdown on the Applications tab.
  var sh = tab(APPLICATIONS_TAB, APP_HEADERS);
  var col = headerIndex(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUS_OPTIONS, true).build();
  sh.getRange(2, col["Status"] + 1, 1000, 1).setDataValidation(rule);

  // Install the on-edit trigger that mints codes on approval (idempotent).
  var has = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === "onStatusEdit";
  });
  if (!has) {
    ScriptApp.newTrigger("onStatusEdit")
      .forSpreadsheet(SHEET_ID).onEdit().create();
  }

  buildDashboard();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function tab(name, headers) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function headerIndex(headerRow) {
  var idx = {};
  headerRow.forEach(function (h, i) { idx[String(h).trim()] = i; });
  return idx;
}

function tierFromStatus(status) {
  if (status === "House Ambassador") return "House Ambassador";
  if (status === "Founder Circle") return "Founder Circle";
  return "Founding Creator";
}

function clean(v, max) {
  var s = (typeof v === "string" ? v : String(v == null ? "" : v)).trim();
  return s.slice(0, max || 200);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
