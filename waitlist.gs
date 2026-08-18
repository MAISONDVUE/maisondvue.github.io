/**
 * MAISON D'VUE - Waitlist, Letters & Reviews backend (Google Apps Script)
 * ---------------------------------------------------------------------------
 * This is the live "MDV waitlist" Web App, recovered from Google Drive and put
 * under version control so it can be read, reviewed, and repaired like the rest
 * of the house. It was previously unversioned: when it misbehaved there was
 * nothing to inspect.
 *
 *   Script:      https://script.google.com/d/1zF2QxAy0X5WDPFkjU6WV82rDk3N8ZibzJLMf9lKqjvIebL1gw2O9eZfS/edit
 *   Sheet:       MAISON D'VUE - Access Requests
 *   Deployment:  Execute as: Me   |   Who has access: Anyone  (already correct)
 *
 *   POST  source=homepage-reservation (or anything unrecognised) -> waitlist tab
 *   POST  source=letters                                         -> letters tab
 *   POST  source=product-review                                  -> reviews tab
 *   GET   -> a health payload with live row counts
 *
 * -- WHAT WAS REPAIRED (three faults, all of them silent) --------------------
 *
 *  1. The subscriber never heard back. The call to sendWelcomeLetter was
 *     commented out, with a note that Mailchimp had taken the email over. It
 *     evidently does not, so nobody was written to at all. Now governed by
 *     SEND_WELCOME_LETTER below, and on by default.
 *
 *  2. A mail outage was reported to the visitor as a failed signup. Mail is
 *     sent through the Zoho API, which throws when its OAuth token is stale.
 *     That exception escaped into doPost's catch, so a signup whose row had
 *     ALREADY been written to the sheet answered {ok:false} and the page told
 *     the guest their signup had faltered. Mail is now best-effort: the row is
 *     the commitment, and the JSON reports separately what was saved and what
 *     was sent.
 *
 *  3. When Zoho was down the House was told nothing. The internal notice now
 *     falls back to Gmail (MailApp), so a signup still reaches you even when
 *     the Zoho token needs renewing.
 *
 * -- AFTER EVERY EDIT --------------------------------------------------------
 * Deploy > Manage deployments > (pencil) > Version: New version > Deploy.
 * Saving the editor alone does NOT update the live /exec URL.
 * ---------------------------------------------------------------------------
 */

const SHEET_ID = '16eemn0c4P3mSQwCWNhhr_yO87sCqfTo-hL5qc9vQP8A';
const FROM_EMAIL = 'hello@maisondvue.com';
const FROM_NAME = "MAISON D'VUE";
const NOTIFY_EMAIL = 'hello@maisondvue.com';

// Tab names — must match the tabs in your sheet exactly (case-sensitive)
const WAITLIST_TAB = 'waitlist';
const REVIEWS_TAB = 'reviews';
const LETTERS_TAB = 'letters';

// Who writes the welcome letter.
//
// false = Mailchimp owns it, via a Customer Journey. This is the chosen setup.
// true  = this script sends the letter below instead.
//
// This was false once before and the guests heard nothing, because the script
// had no Mailchimp integration and the audience never received the addresses.
// It does now (see mcSubscribe), so the arrangement holds -- but it rests on a
// Journey actually existing and being switched on. Build it on the TAG trigger
// ("waitlist"), not "signs up": contacts added through the API arrive already
// subscribed, and the tag is the event this script can guarantee.
//
// If the Mailchimp mirror fails for a given signup, the script sends the letter
// itself rather than leave that guest unanswered -- see doPost.
const SEND_WELCOME_LETTER = false;

// The allocation the welcome letter promises. UPDATE THIS when the allocation
// moves on — the letter tells the guest which bottles they are waiting for.
const ALLOCATION_MONTH = 'June';

// -- Mailchimp -------------------------------------------------------------
// Every signup is mirrored into the audience so the list lives somewhere other
// than a spreadsheet. The API key lives in Script Properties (Project Settings
// ▸ Script Properties) under MAILCHIMP_API_KEY so it never touches the repo;
// the datacenter is read from the key's suffix.
//
// This script already calls UrlFetchApp for Zoho, so the external-request scope
// is granted and no re-authorization is needed.
//
// Members are added with status_if_new "subscribed", NOT "pending": the welcome
// letter above is the confirmation, so Mailchimp must not also send a
// double-opt-in request. Keep any Mailchimp welcome Journey switched off unless
// you also set SEND_WELCOME_LETTER to false, or guests receive two letters.
const MC_AUDIENCE_ID = '3a9da7ab07';          // us20 "MAISON D'VUE" audience
const MC_TAG_WAITLIST = 'waitlist';
const MC_TAG_LETTERS = 'letters';

function doPost(e) {
  try {
    var params = (e && e.parameter) || {};
    if ((!params.email && !params.reviewBody) && e && e.postData && e.postData.contents) {
      try { params = JSON.parse(e.postData.contents); } catch (_) {}
    }

    var source = String(params.source || 'Website').trim();

    // Route review submissions to handleReview; letters to handleLetters; everything else is waitlist
    if (source.toLowerCase() === 'product-review') {
      return handleReview(params);
    }
    if (source.toLowerCase() === 'letters') {
      return handleLetters(params);
    }

    // ===== WAITLIST FLOW =====
    var name   = String(params.firstName || params.name || '').trim();
    var email  = String(params.email || '').trim().toLowerCase();

    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      return jsonResponse({ ok: false, error: 'Invalid email' });
    }

    var sheet = getSheetByName(WAITLIST_TAB);
    sheet.appendRow([
      name,
      email,
      new Date().toLocaleDateString(),
      'Pending',
      source
    ]);

    // The row above is the commitment. Everything below is best-effort: a mail
    // outage must never be reported to the guest as a failed signup.
    var listed = trySend(function () { mcSubscribe(email, name, MC_TAG_WAITLIST); });

    // Mailchimp is expected to write the welcome. If the address never reached
    // Mailchimp, nobody is going to -- so send the house letter rather than let
    // the signup go unanswered. Unanswered signups are the fault this file was
    // recovered to fix; they must not return by a second route.
    var welcomedBy = 'mailchimp';
    if (SEND_WELCOME_LETTER || !listed) {
      welcomedBy = trySend(function () { sendWelcomeLetter(email, name); }) ? 'house' : 'nobody';
    }

    var notified = trySend(function () { sendInternalNotification(name, email, source, welcomedBy); });

    return jsonResponse({ ok: true, saved: true, listed: listed, welcomedBy: welcomedBy, notified: notified });
  } catch (err) {
    return jsonResponse({ ok: false, error: err && err.toString() });
  }
}

// ============================================================
// REVIEW HANDLER — saves to reviews tab, notifies Masiela
// ============================================================
function handleReview(params) {
  try {
    var reviewName   = String(params.reviewName || '').trim();
    var reviewRating = parseInt(params.reviewRating, 10) || 0;
    var reviewBody   = String(params.reviewBody || '').trim();
    var userAgent    = String(params.userAgent || '').trim();
    var referrer     = String(params.referrer || '').trim();

    if (!reviewName) {
      return jsonResponse({ ok: false, error: 'Name required' });
    }
    if (reviewRating < 1 || reviewRating > 5) {
      return jsonResponse({ ok: false, error: 'Rating must be between 1 and 5' });
    }
    if (!reviewBody) {
      return jsonResponse({ ok: false, error: 'Review text required' });
    }

    var sheet = getSheetByName(REVIEWS_TAB);

    // Initialize headers if the tab is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Date', 'Name', 'Rating', 'Review', 'Status', 'User Agent', 'Referrer']);
      sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      new Date().toLocaleDateString(),
      reviewName,
      reviewRating,
      reviewBody,
      'Pending',
      userAgent,
      referrer
    ]);

    var notified = trySend(function () { sendReviewNotification(reviewName, reviewRating, reviewBody); });

    return jsonResponse({ ok: true, saved: true, notified: notified });
  } catch (err) {
    return jsonResponse({ ok: false, error: err && err.toString() });
  }
}

// ============================================================
// LETTERS HANDLER — saves to letters tab, notifies Masiela
// ============================================================
function handleLetters(params) {
  try {
    var name  = String(params.firstName || params.name || '').trim();
    var email = String(params.email || '').trim().toLowerCase();

    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      return jsonResponse({ ok: false, error: 'Invalid email' });
    }

    var sheet = getSheetByName(LETTERS_TAB);

    // Initialize headers if the tab is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Date', 'Name', 'Email', 'Status', 'Source']);
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      new Date().toLocaleDateString(),
      name,
      email,
      'Active',
      'product-popup'
    ]);

    var listed = trySend(function () { mcSubscribe(email, name, MC_TAG_LETTERS); });
    var notified = trySend(function () { sendLettersNotification(name, email); });

    return jsonResponse({ ok: true, saved: true, listed: listed, notified: notified });
  } catch (err) {
    return jsonResponse({ ok: false, error: err && err.toString() });
  }
}

// ============================================================
// Internal notification when a new review comes in
// ============================================================
function sendReviewNotification(name, rating, body) {
  var subject = 'New review — ' + name + ' (' + rating + ' star' + (rating === 1 ? '' : 's') + ')';

  var stars = '';
  for (var i = 0; i < rating; i++) { stars += '&#9733;'; }
  for (var j = rating; j < 5; j++) { stars += '<span style="color:#D9C9A8;">&#9733;</span>'; }

  var htmlBody =
    '<div style="font-family: Georgia, serif; font-size: 14px; line-height: 1.7; color: #1A130D; max-width: 560px;">' +
      '<p style="font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; color: #A88A52; margin: 0 0 16px 0;">A new review has been submitted</p>' +
      '<p style="margin: 0 0 6px 0;"><strong>Name:</strong> ' + escapeHtml(name) + '</p>' +
      '<p style="margin: 0 0 6px 0;"><strong>Rating:</strong> <span style="color:#C9A96E;font-size:16px;letter-spacing:0.08em;">' + stars + '</span></p>' +
      '<p style="margin: 0 0 6px 0;"><strong>Time:</strong> ' + new Date().toLocaleString() + '</p>' +
      '<p style="margin: 24px 0 8px 0;"><strong>Review:</strong></p>' +
      '<blockquote style="font-style: italic; color: #6E6055; border-left: 2px solid #C9A96E; padding: 6px 0 6px 16px; margin: 0 0 24px 8px;">' +
        escapeHtml(body) +
      '</blockquote>' +
      '<p style="font-size: 12px; color: #8A7C6E; border-top: 1px solid #E4D7B8; padding-top: 16px; margin-top: 28px;">' +
        'Open the <em>reviews</em> tab in MAISON D\'VUE — Access Requests. Change Status to <strong>Approved</strong> or <strong>Rejected</strong>. Approved reviews can then be added to product.html.' +
      '</p>' +
    '</div>';

  sendNotice(NOTIFY_EMAIL, subject, htmlBody);
}

// ============================================================
// Internal notification when a new letters subscription comes in
// ============================================================
function sendLettersNotification(name, email) {
  var subject = 'New letters subscriber — ' + (name || email);

  var htmlBody =
    '<div style="font-family: Georgia, serif; font-size: 14px; line-height: 1.7; color: #1A130D; max-width: 560px;">' +
      '<p style="font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; color: #A88A52; margin: 0 0 16px 0;">A new letters subscriber</p>' +
      '<p style="margin: 0 0 6px 0;"><strong>Name:</strong> ' + escapeHtml(name || '(not provided)') + '</p>' +
      '<p style="margin: 0 0 6px 0;"><strong>Email:</strong> ' + escapeHtml(email) + '</p>' +
      '<p style="margin: 0 0 6px 0;"><strong>Source:</strong> Product page popup</p>' +
      '<p style="margin: 0 0 6px 0;"><strong>Time:</strong> ' + new Date().toLocaleString() + '</p>' +
      '<p style="font-size: 12px; color: #8A7C6E; border-top: 1px solid #E4D7B8; padding-top: 16px; margin-top: 28px;">' +
        'Open the <em>letters</em> tab in MAISON D\'VUE — Access Requests to view all subscribers. Status defaults to <strong>Active</strong>.' +
      '</p>' +
    '</div>';

  sendNotice(NOTIFY_EMAIL, subject, htmlBody);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSheetByName(name) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

// ============================================================
// MAILCHIMP — mirror every address into the audience
// ============================================================
function mcKey() {
  return PropertiesService.getScriptProperties().getProperty('MAILCHIMP_API_KEY') || '';
}

// Configured only once a real "<key>-<dc>" value is present in Script Properties.
function mcConfigured() { return mcKey().indexOf('-') !== -1; }

// API base for this key's datacenter (the part after the dash, e.g. "us20").
function mcBase() {
  var dc = mcKey().split('-')[1] || 'us20';
  return 'https://' + dc + '.api.mailchimp.com/3.0';
}

function mcAuth() {
  return 'Basic ' + Utilities.base64Encode('key:' + mcKey());
}

// Mailchimp's subscriber id is the MD5 of the lowercased email address.
function mcHash(email) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5, String(email).trim().toLowerCase(), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/**
 * Add or update one member, then tag them.
 *
 * Throws on failure so the caller's trySend records it -- the sheet row has
 * already been written by then, so a Mailchimp outage costs the mirror, never
 * the signup. An existing member keeps whatever status they already have;
 * status_if_new only governs first contact.
 */
function mcSubscribe(email, firstName, tag) {
  if (!mcConfigured()) {
    throw new Error('MAILCHIMP_API_KEY is not set in Script Properties — address saved to the sheet only.');
  }

  var members = mcBase() + '/lists/' + MC_AUDIENCE_ID + '/members/' + mcHash(email);

  var res = UrlFetchApp.fetch(members, {
    method: 'put',
    contentType: 'application/json',
    headers: { Authorization: mcAuth() },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      email_address: email,
      status_if_new: 'subscribed',
      merge_fields: firstName ? { FNAME: firstName } : {}
    })
  });

  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Mailchimp subscribe failed (' + code + '): ' + res.getContentText());
  }

  // Tagging is separate, and a tag failure must not undo a good subscribe.
  if (tag) {
    try {
      UrlFetchApp.fetch(members + '/tags', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: mcAuth() },
        muteHttpExceptions: true,
        payload: JSON.stringify({ tags: [{ name: tag, status: 'active' }] })
      });
    } catch (err) { console.error(err); }
  }

  return true;
}

/**
 * One-time, and safe to re-run: push every address already in the sheet up to
 * Mailchimp. The homepage waitlist never fed the audience, so the existing
 * entries are not there. Run once from the editor after setting the API key.
 */
function backfillMailchimp() {
  if (!mcConfigured()) throw new Error('Set MAILCHIMP_API_KEY in Script Properties first (Project Settings).');

  var jobs = [
    { tab: WAITLIST_TAB, nameCol: 0, emailCol: 1, tag: MC_TAG_WAITLIST },
    { tab: LETTERS_TAB,  nameCol: 1, emailCol: 2, tag: MC_TAG_LETTERS }
  ];
  var added = 0, skipped = 0, failed = 0;

  jobs.forEach(function (job) {
    var sheet = getSheetByName(job.tab);
    var last = sheet.getLastRow();
    if (last < 2) return;

    sheet.getRange(2, 1, last - 1, 5).getValues().forEach(function (row) {
      var email = String(row[job.emailCol] || '').trim().toLowerCase();
      // Hand-entered rows are ragged — some hold a note where the email belongs.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skipped++; return; }
      try {
        mcSubscribe(email, String(row[job.nameCol] || '').trim(), job.tag);
        added++;
      } catch (err) {
        failed++;
        console.error(email + ' — ' + err);
      }
    });
  });

  Logger.log('Mailchimp backfill: ' + added + ' sent, ' + skipped + ' skipped (no valid email), ' + failed + ' failed.');
  return { added: added, skipped: skipped, failed: failed };
}

// ============================================================
// ZOHO MAIL API — fetches a fresh access token using refresh token
// ============================================================
function getZohoAccessToken() {
  var props = PropertiesService.getScriptProperties();
  var clientId     = props.getProperty('ZOHO_CLIENT_ID');
  var clientSecret = props.getProperty('ZOHO_CLIENT_SECRET');
  var refreshToken = props.getProperty('ZOHO_REFRESH_TOKEN');

  var response = UrlFetchApp.fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'post',
    payload: {
      grant_type:    'refresh_token',
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    },
    muteHttpExceptions: true
  });

  var data = JSON.parse(response.getContentText());
  if (!data.access_token) {
    throw new Error('Zoho token error: ' + response.getContentText());
  }
  return data.access_token;
}

// ============================================================
// Send email via Zoho Mail REST API
// ============================================================
function sendViaZoho(toEmail, subject, htmlBody) {
  var props = PropertiesService.getScriptProperties();
  var accountId   = props.getProperty('ZOHO_ACCOUNT_ID');
  var accessToken = getZohoAccessToken();

  var payload = {
    fromAddress: '"' + FROM_NAME + '" <' + FROM_EMAIL + '>',
    toAddress:   toEmail,
    subject:     subject,
    content:     htmlBody,
    mailFormat:  'html'
  };

  var response = UrlFetchApp.fetch(
    'https://mail.zoho.com/api/accounts/' + accountId + '/messages',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Zoho-oauthtoken ' + accessToken },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  var responseText = response.getContentText();
  var responseCode = response.getResponseCode();
  if (responseCode !== 200) {
    throw new Error('Zoho send error (' + responseCode + '): ' + responseText);
  }
  return JSON.parse(responseText);
}

/**
 * An internal notice, by whatever route still works.
 *
 * Zoho is preferred because it sends from hello@maisondvue.com. When its token
 * is stale the notice falls back to Gmail rather than vanishing -- being told
 * late from the wrong address beats not being told at all. Throws only if both
 * routes fail, so trySend can record it.
 */
function sendNotice(toEmail, subject, htmlBody) {
  try {
    return sendViaZoho(toEmail, subject, htmlBody);
  } catch (zohoErr) {
    MailApp.sendEmail({
      to: toEmail,
      name: FROM_NAME,
      subject: subject + ' [sent via Gmail — the Zoho token needs renewing]',
      htmlBody: htmlBody
    });
    return { fallback: 'gmail', zohoError: String(zohoErr) };
  }
}

/**
 * Run fn, report whether it worked, and never let it escape.
 *
 * Mail is not the commitment -- the sheet row is. This keeps a mail failure
 * from turning a recorded signup into an error on the page.
 */
function trySend(fn) {
  try { fn(); return true; } catch (err) { console.error(err); return false; }
}

// ============================================================
// Welcome letter to new sign-up
// ============================================================
function sendWelcomeLetter(toEmail, name) {
  var subject = "A note from MAISON D'VUE";

  var htmlBody =
    '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<title>A note from Maison d&rsquo;Vue</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">' +
      '<style>' +
        'a, a:hover, a:active, a:visited { color: #A88A52; text-decoration: none; }' +
        '@media only screen and (max-width: 600px) {' +
          '.mdv-card { padding: 36px 24px !important; }' +
          '.mdv-body { font-size: 17px !important; }' +
          '.mdv-note { font-size: 17px !important; }' +
          '.mdv-wordmark { font-size: 14px !important; letter-spacing: 0.32em !important; }' +
        '}' +
      '</style>' +
    '</head>' +
    '<body style="margin: 0; padding: 0; background-color: #F4EFE3; font-family: \'Cormorant Garamond\', Garamond, Georgia, serif; color: #1A130D; -webkit-font-smoothing: antialiased;">' +

      '<div style="display: none; font-size: 1px; color: #F4EFE3; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">' +
        'You are on the list.' +
      '</div>' +

      '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #F4EFE3;">' +
        '<tr><td align="center" style="padding: 48px 16px;">' +

          '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 620px;">' +
            '<tr><td align="center" style="padding-bottom: 24px;">' +
              '<div class="mdv-wordmark" style="font-family: \'Cormorant Garamond\', Garamond, Georgia, serif; font-weight: 500; font-size: 16px; letter-spacing: 0.42em; text-transform: uppercase; color: #1A130D; padding-left: 0.42em;">' +
                'Maison d&rsquo;Vue' +
              '</div>' +
            '</td></tr>' +
          '</table>' +

          '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 620px; background-color: #FBF8F1; border: 1px solid #E4D7B8;">' +
            '<tr><td class="mdv-card" style="padding: 56px 56px 48px 56px; font-family: \'Cormorant Garamond\', Garamond, Georgia, serif; color: #1A130D; line-height: 1.7;">' +

              '<table cellspacing="0" cellpadding="0" border="0" width="100%">' +
                '<tr><td align="center" style="padding-bottom: 32px;">' +
                  '<table cellspacing="0" cellpadding="0" border="0"><tr>' +
                    '<td width="32" height="1" style="background-color: #C9A96E; font-size: 1px; line-height: 1px;">&nbsp;</td>' +
                  '</tr></table>' +
                '</td></tr>' +
              '</table>' +

              '<p class="mdv-note" style="font-style: italic; color: #A88A52; font-size: 20px; line-height: 1.5; text-align: center; margin: 0 0 40px 0;">' +
                'You are on the list.' +
              '</p>' +

              '<p class="mdv-body" style="font-size: 18px; line-height: 1.75; margin: 0 0 22px 0;">' +
                '<strong style="font-weight: 500; letter-spacing: 0.04em;">MAISON D&rsquo;VUE</strong> is an American house, hand-sealed in Beverly Hills. The Hair Elixir is a ritual of fourteen rare botanical essences.' +
              '</p>' +

              '<p class="mdv-body" style="font-size: 18px; line-height: 1.75; margin: 0 0 32px 0;">' +
                'When the ' + ALLOCATION_MONTH + ' bottles are ready, you will be the first to know. A second letter will follow, with instructions on how to claim yours.' +
              '</p>' +

              '<p class="mdv-note" style="font-style: italic; color: #A88A52; font-size: 20px; line-height: 1.5; text-align: center; margin: 0 0 44px 0;">' +
                '(And the people who keep returning tend to have very good hair.)' +
              '</p>' +

              '<p class="mdv-body" style="font-size: 18px; line-height: 1.5; margin: 0 0 6px 0;">With care,</p>' +
              '<p style="font-family: \'Cormorant Garamond\', Garamond, Georgia, serif; font-weight: 500; font-size: 14px; letter-spacing: 0.42em; text-transform: uppercase; color: #1A130D; margin: 0; padding-left: 0.42em;">' +
                'The House' +
              '</p>' +

              '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 48px;">' +
                '<tr><td height="1" style="background-color: #E4D7B8; font-size: 1px; line-height: 1px;">&nbsp;</td></tr>' +
              '</table>' +

              '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 28px;">' +
                '<tr><td style="font-family: \'Cormorant Garamond\', Garamond, Georgia, serif;">' +
                  '<div style="font-weight: 500; font-size: 14px; letter-spacing: 0.36em; text-transform: uppercase; color: #1A130D; padding-left: 0.36em; margin-bottom: 10px;">Maison d&rsquo;Vue</div>' +
                  '<div style="font-style: italic; font-size: 15px; color: #6E6055; margin-bottom: 6px;">Rare by origin. Refined by design.</div>' +
                  '<div style="font-size: 13px; color: #8A7C6E; letter-spacing: 0.04em;">Hand-sealed in Beverly Hills</div>' +
                '</td></tr>' +
              '</table>' +

            '</td></tr>' +
          '</table>' +

          '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 620px;">' +
            '<tr><td align="center" style="padding-top: 28px; font-family: \'Cormorant Garamond\', Garamond, Georgia, serif;">' +
              '<p style="font-style: italic; font-size: 14px; color: #8A7C6E; line-height: 1.6; margin: 0;">' +
                'If you have any questions, write to <a href="mailto:hello@maisondvue.com" style="color: #A88A52; text-decoration: none; border-bottom: 1px solid #D9C9A8; padding-bottom: 1px;">hello@maisondvue.com</a>.' +
              '</p>' +
            '</td></tr>' +
            '<tr><td align="center" style="padding-top: 16px;">' +
              '<p style="font-family: Helvetica, Arial, sans-serif; font-size: 10px; letter-spacing: 0.32em; text-transform: uppercase; color: #B3A795; margin: 0; padding-left: 0.32em;">' +
                'MDV Group, LLC &nbsp;&middot;&nbsp; Beverly Hills, California' +
              '</p>' +
            '</td></tr>' +
          '</table>' +

        '</td></tr>' +
      '</table>' +

    '</body>' +
    '</html>';

  sendViaZoho(toEmail, subject, htmlBody);
}

// ============================================================
// Internal notification to Masiela (waitlist signups)
// ============================================================
function sendInternalNotification(name, email, source, welcomedBy) {
  var subject = 'New reservation — ' + (name || email);

  // Say plainly who wrote to this guest. A silent signup is the one failure
  // worth interrupting you for, so it is stated here rather than left in a log.
  var welcome = '';
  if (welcomedBy === 'mailchimp') {
    welcome = '<p style="color:#6E6055;">Their welcome letter is Mailchimp\'s to send — they were added to the audience and tagged <strong>' + MC_TAG_WAITLIST + '</strong>.</p>';
  } else if (welcomedBy === 'house') {
    welcome = '<p style="color:#6E6055;">The Mailchimp mirror did not take, so the House sent the welcome letter directly. Worth checking the API key.</p>';
  } else if (welcomedBy === 'nobody') {
    welcome = '<p style="color:#B26A6A;"><strong>This guest has not been written to.</strong> Mailchimp did not take the address and the welcome letter could not be sent. They are in the sheet — please write to them.</p>';
  }

  var htmlBody =
    '<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">' +
      '<p>New reservation received.</p>' +
      '<p><strong>Name:</strong> ' + (name || '(not provided)') + '<br>' +
      '<strong>Email:</strong> ' + email + '<br>' +
      '<strong>Source:</strong> ' + source + '<br>' +
      '<strong>Time:</strong> ' + new Date().toLocaleString() + '</p>' +
      welcome +
    '</div>';

  sendNotice(NOTIFY_EMAIL, subject, htmlBody);
}

// ============================================================
// Endpoints
// ============================================================
// Open the /exec URL in a browser to confirm the list is live and see how many
// addresses it holds. Row counts are the quickest way to tell a working
// deployment from a dead one.
function doGet(e) {
  try {
    return jsonResponse({
      ok: true,
      message: "Maison d'Vue waitlist endpoint is live.",
      waitlist: Math.max(0, getSheetByName(WAITLIST_TAB).getLastRow() - 1),
      letters: Math.max(0, getSheetByName(LETTERS_TAB).getLastRow() - 1),
      reviews: Math.max(0, getSheetByName(REVIEWS_TAB).getLastRow() - 1),
      welcomeLetter: SEND_WELCOME_LETTER ? 'sent by the House' : 'sent by Mailchimp',
      mailchimp: mcConfigured() ? 'on' : 'no api key'
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err && err.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// TEST FUNCTIONS — run from editor to verify
// ============================================================

/**
 * The one to run after any change. Walks the whole waitlist chain with a real
 * address, then removes the test row. Read the execution log for the verdict.
 */
function selfTest() {
  var email = Session.getEffectiveUser().getEmail();
  var res = JSON.parse(doPost({
    parameter: { email: email, firstName: 'Self Test', source: 'self-test' }
  }).getContent());

  var sheet = getSheetByName(WAITLIST_TAB);
  var last = sheet.getLastRow();
  if (last > 1 && String(sheet.getRange(last, 5).getValue()) === 'self-test') {
    sheet.deleteRow(last);
  }

  Logger.log(res.ok
    ? 'Row written. Mailchimp: ' + (res.listed ? 'added + tagged' : 'FAILED') +
      '. Welcome letter: ' + res.welcomedBy +
      (res.welcomedBy === 'mailchimp' ? ' (confirm the Journey actually fired — check the inbox)' : '') +
      '. Notice to ' + NOTIFY_EMAIL + ': ' + (res.notified ? 'sent' : 'FAILED') +
      '. Test row removed.'
    : 'FAIL — ' + res.error);
  return res;
}

function testWelcomeLetter() {
  sendWelcomeLetter('masielal@yahoo.com', 'Masiela');
}

function testGetToken() {
  Logger.log(getZohoAccessToken());
}

function testReviewNotification() {
  sendReviewNotification('Masiela', 5, 'This is a test review submitted from the Apps Script editor to verify the notification flow works.');
}

function testLettersNotification() {
  sendLettersNotification('Test User', 'test@example.com');
}
