/**
 * MAISON D'VUE - Waitlist & Letters backend (Google Apps Script)
 * ---------------------------------------------------------------------------
 * The Web App behind the homepage reservation form. A Google Sheet is the data
 * store and the admin view - no server, no database, the same pattern the
 * Founding Creator Program uses.
 *
 *   POST  source=homepage-reservation   -> record a waitlist signup
 *   POST  source=letters                -> record a Letters subscription
 *   POST  source=product-review         -> record a product review
 *   GET   ?action=health                -> {ok, waitlist:<count>, reviews:<count>}
 *
 * Every accepted signup does three things, in this order:
 *   1. Appends a row to the Waitlist tab           (the address is collected)
 *   2. Emails NOTIFY_EMAIL with who just joined    (the House is told)
 *   3. Emails the subscriber a confirmation        (the person is told)
 * and returns JSON so the page can confirm delivery rather than guess.
 *
 * -- DEPLOY (about a minute, nothing to edit) --------------------------------
 *  1. Open a blank Google Sheet (sheets.new).
 *  2. Extensions > Apps Script. Delete the placeholder, paste this whole file.
 *     (Leave SHEET_ID empty - a bound script uses its own sheet automatically.)
 *  3. Run `setup` once (Run > setup) and authorize.
 *  4. Deploy > New deployment > Web app.
 *       Execute as: Me   |   Who has access: Anyone
 *     "Anyone" is required. "Anyone with Google account" makes every browser
 *     POST bounce off a sign-in page and the form silently fails - which is
 *     exactly how a waitlist stops collecting addresses.
 *  5. Paste the Web App URL into WAITLIST_ENDPOINT in index.html and
 *     REVIEW_ENDPOINT in product.html.
 *  6. Run `selfTest` to prove the whole chain end to end.
 *
 * -- AFTER EVERY EDIT --------------------------------------------------------
 * Deploy > Manage deployments > (pencil) > Version: New version > Deploy.
 * Saving the editor alone does NOT update the live /exec URL.
 * ---------------------------------------------------------------------------
 */

// -- Configuration ------------------------------------------------------------
// Leave SHEET_ID empty when this script is bound to its sheet (the normal case:
// created via Extensions > Apps Script). Only set it if you run the script
// standalone, pointing at a sheet by ID from its URL (.../d/<ID>/edit).
var SHEET_ID = "";

// Where the "someone just joined" notice goes ("" to disable).
// Comma-separate for several recipients.
var NOTIFY_EMAIL = "hello@maisondvue.com";

// Display name and reply address on the automated emails.
var SENDER_NAME = "MAISON D'VUE";
var REPLY_TO = "hello@maisondvue.com";

// Send the subscriber their own confirmation. Set false only if a Mailchimp
// Journey has taken over that email, so nobody is written to twice.
var SEND_SUBSCRIBER_CONFIRMATION = true;

// Notify the House about new reviews as well as new signups.
var NOTIFY_ON_REVIEW = true;

// -- Tabs ---------------------------------------------------------------------
var WAITLIST_TAB = "Waitlist";
var REVIEWS_TAB = "Reviews";

var WAITLIST_HEADERS = [
  "Date", "First Name", "Email", "Source", "Times Joined", "Last Seen",
  "Confirmation Sent", "Referrer", "User Agent"
];

var REVIEW_HEADERS = [
  "Date", "Name", "Rating", "Review", "Status", "Source", "Referrer", "User Agent"
];

// -- Intake --------------------------------------------------------------------
function doPost(e) {
  try {
    var p = (e && e.parameter) || {};

    // Honeypot - silently accept and discard.
    if (p.website) return json({ ok: true });

    var source = clean(p.source) || "homepage-reservation";

    if (source === "product-review") return recordReview(p, source);
    return recordSignup(p, source);
  } catch (err) {
    // Surface the reason rather than a bare failure: the page logs it and the
    // founder can read it by POSTing from the browser console.
    return json({ ok: false, error: String(err) });
  }
}

function recordSignup(p, source) {
  var email = String(p.email || "").trim().toLowerCase();
  if (!isEmail(email)) return json({ ok: false, error: "A valid email is required." });

  var firstName = clean(p.firstName, 80);
  var sheet = tab(WAITLIST_TAB, WAITLIST_HEADERS);
  var now = new Date();
  var existing = findEmailRow(sheet, email);

  if (existing) {
    // Already on the list: keep one row per person, note the repeat visit,
    // and do not write to them again.
    sheet.getRange(existing.row, 5).setValue((Number(existing.times) || 1) + 1);
    sheet.getRange(existing.row, 6).setValue(now);
    if (firstName && !existing.firstName) sheet.getRange(existing.row, 2).setValue(firstName);
    return json({ ok: true, duplicate: true, email: email });
  }

  var confirmed = SEND_SUBSCRIBER_CONFIRMATION ? sendWaitlistConfirmation(email, firstName) : false;

  sheet.appendRow([
    now,
    firstName,
    email,
    source,
    1,
    now,
    confirmed ? "Yes" : (SEND_SUBSCRIBER_CONFIRMATION ? "Failed" : "Off"),
    clean(p.referrer, 300),
    clean(p.userAgent, 300)
  ]);

  notifyHouseOfSignup(email, firstName, source, p, sheet.getLastRow() - 1);

  return json({ ok: true, email: email, confirmationSent: confirmed });
}

function recordReview(p, source) {
  var body = clean(p.reviewBody, 4000);
  if (!body) return json({ ok: false, error: "A review is required." });

  var name = clean(p.reviewName, 120);
  var rating = clean(p.reviewRating, 10);
  var sheet = tab(REVIEWS_TAB, REVIEW_HEADERS);

  sheet.appendRow([
    new Date(), name, rating, body, "Pending", source,
    clean(p.referrer, 300), clean(p.userAgent, 300)
  ]);

  if (NOTIFY_ON_REVIEW && NOTIFY_EMAIL) {
    trySend(function () {
      MailApp.sendEmail(NOTIFY_EMAIL, "New review - " + (rating || "?") + " stars from " + (name || "a guest"), [
        "A new product review is awaiting moderation.",
        "",
        "Name: " + (name || "(not given)"),
        "Rating: " + (rating || "(not given)"),
        "",
        body,
        "",
        "Approve or decline it in the Reviews tab."
      ].join("\n"));
    });
  }

  return json({ ok: true });
}

// -- Health --------------------------------------------------------------------
// Open the /exec URL in a browser to confirm the list is live and see how many
// addresses it holds. This is the quickest way to tell a working deployment
// from a dead one.
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action && p.action !== "health") return json({ ok: false, error: "Unknown action." });

  try {
    return json({
      ok: true,
      service: "MAISON D'VUE waitlist",
      waitlist: Math.max(0, tab(WAITLIST_TAB, WAITLIST_HEADERS).getLastRow() - 1),
      reviews: Math.max(0, tab(REVIEWS_TAB, REVIEW_HEADERS).getLastRow() - 1),
      notify: NOTIFY_EMAIL ? "on" : "off",
      confirmations: SEND_SUBSCRIBER_CONFIRMATION ? "on" : "off"
    });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// -- Emails ---------------------------------------------------------------------
// The subscriber's confirmation is the one email that must not fail quietly:
// its outcome is written into the sheet's Confirmation Sent column and returned
// to the page.
function sendWaitlistConfirmation(email, first) {
  try {
    MailApp.sendEmail({
      to: email,
      name: SENDER_NAME,
      replyTo: REPLY_TO,
      subject: "You are on the list",
      htmlBody: emailShell(
        "You Are on the List",
        "<p>" + greeting(first) + "</p>" +
        "<p>Your place on the waitlist for <em>The Hair Elixir</em> is confirmed. Fourteen rare essences, scented in &Acirc;me de Vue&trade;.</p>" +
        "<p>You will have first access when the Allocation opens, and a gift accompanies your first purchase.</p>" +
        "<p>Nothing further is required of you. A letter will follow.</p>" +
        "<p style='margin-top:28px'>Warm regards,<br>MAISON D&rsquo;VUE</p>"
      )
    });
    return true;
  } catch (err) {
    return false;
  }
}

function notifyHouseOfSignup(email, first, source, p, total) {
  if (!NOTIFY_EMAIL) return;
  trySend(function () {
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      name: SENDER_NAME,
      replyTo: email,          // reply goes straight to the person who joined
      subject: "New waitlist signup - " + (first ? first + " (" + email + ")" : email),
      body: [
        (first || "Someone") + " just joined the waitlist.",
        "",
        "Name: " + (first || "(not given)"),
        "Email: " + email,
        "Source: " + source,
        "Referrer: " + (clean(p.referrer, 300) || "(direct)"),
        "Joined: " + new Date(),
        "",
        "That makes " + total + " on the list.",
        "Reply to this message to write to them directly."
      ].join("\n")
    });
  });
}

function greeting(first) {
  first = clean(first);
  return first ? ("Dear " + first + ",") : "Dear Friend of the House,";
}

// A restrained cream/navy serif email frame, in the house register.
function emailShell(title, inner) {
  return "" +
    "<div style='background:#F4EDE1;padding:40px 0;font-family:Georgia,\"Times New Roman\",serif;color:#0B1F3A'>" +
    "<div style='max-width:560px;margin:0 auto;background:#FBF7F0;padding:48px 44px;border:1px solid rgba(11,31,58,0.12)'>" +
    "<div style='font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#0B1F3A;text-align:center'>MAISON D&rsquo;VUE</div>" +
    "<h1 style='font-weight:400;font-size:26px;text-align:center;margin:24px 0 28px;color:#0B1F3A'>" + title + "</h1>" +
    "<div style='font-size:16px;line-height:1.7;color:#0B1F3A'>" + inner + "</div>" +
    "</div>" +
    "<div style='max-width:560px;margin:18px auto 0;text-align:center;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a8170'>Hand-sealed &middot; Beverly Hills</div>" +
    "</div>";
}

// -- Setup & verification --------------------------------------------------------
function setup() {
  tab(WAITLIST_TAB, WAITLIST_HEADERS);
  tab(REVIEWS_TAB, REVIEW_HEADERS);
  var sh = tab(WAITLIST_TAB, WAITLIST_HEADERS);
  sh.setColumnWidth(1, 150);   // Date
  sh.setColumnWidth(3, 260);   // Email
  sh.setColumnWidth(9, 220);   // User Agent
}

/**
 * Proves the whole chain: writes a row, emails the House, emails the address,
 * then removes the row again. Run it after deploying, and any time the form
 * looks doubtful. Read the execution log for the verdict.
 */
function selfTest() {
  var email = Session.getEffectiveUser().getEmail();
  var res = JSON.parse(recordSignup(
    { email: email, firstName: "Self Test", referrer: "selfTest()" },
    "self-test"
  ).getContent());

  if (res.duplicate) {
    // That address is a genuine subscriber - leave the row alone.
    Logger.log("SKIPPED - " + email + " is already on the list, so nothing was written. " +
               "Run selfTest from an account that has not signed up, or remove the row first.");
    return res;
  }

  var sheet = tab(WAITLIST_TAB, WAITLIST_HEADERS);
  var row = findEmailRow(sheet, String(email).toLowerCase());
  if (row) sheet.deleteRow(row.row);

  Logger.log(res.ok
    ? "PASS - row written, confirmation " + (res.confirmationSent ? "sent" : "FAILED") +
      ", notice sent to " + (NOTIFY_EMAIL || "(disabled)") + ". Test row removed."
    : "FAIL - " + res.error);
  return res;
}

// -- Helpers ---------------------------------------------------------------------
// The waitlist spreadsheet: the bound sheet by default, or one named by
// SHEET_ID when running standalone. Lets the same script work either way.
function book() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function tab(name, headers) {
  var ss = book();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  } else if (sh.getLastRow() > 0) {
    return sh;
  }
  sh.appendRow(headers);
  sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  sh.setFrozenRows(1);
  return sh;
}

// One row per address. Returns {row, times, firstName} or null.
function findEmailRow(sheet, email) {
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][2]).trim().toLowerCase() === email) {
      return { row: i + 2, times: rows[i][4], firstName: String(rows[i][1] || "").trim() };
    }
  }
  return null;
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ""));
}

// Notifications are best-effort: a mail hiccup must never lose the address.
function trySend(fn) {
  try { fn(); } catch (err) { /* best-effort */ }
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
