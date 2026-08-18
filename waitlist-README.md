# MAISON D’VUE — Waitlist, Letters & Reviews

The homepage reservation form (`index.html`) and the Letters and review forms on
`product.html` all post to one Google Apps Script Web App, with a Google Sheet as
the data store and the admin view. `waitlist.gs` is that Web App.

| Piece | Where |
| --- | --- |
| Script project | **MDV waitlist** — [`script.google.com/d/1zF2Qx…`](https://script.google.com/d/1zF2QxAy0X5WDPFkjU6WV82rDk3N8ZibzJLMf9lKqjvIebL1gw2O9eZfS/edit) |
| Spreadsheet | **MAISON D’VUE - Access Requests** — [`docs.google.com/spreadsheets/d/16eemn…`](https://docs.google.com/spreadsheets/d/16eemn0c4P3mSQwCWNhhr_yO87sCqfTo-hL5qc9vQP8A/edit) |
| Deployment | Execute as **Me**, Who has access **Anyone** |
| Outgoing mail | Zoho Mail REST API, as `hello@maisondvue.com` |

The script lived only in Google Drive until now. That is why, when it misbehaved,
there was nothing to read: `waitlist.gs` is that same script under version
control, with the faults below repaired.

---

## 1 · What was wrong

Three faults, none of which announced itself.

**The guest never heard back.** The call to `sendWelcomeLetter` was commented
out, with a note saying Mailchimp had taken the email over. It had not, so
signups went unanswered. Governed now by `SEND_WELCOME_LETTER`, on by default.

**A mail outage was shown to the guest as a failed signup.** Mail goes through
the Zoho API, which throws when its OAuth token is stale. That exception escaped
into `doPost`’s catch, so a signup whose row had *already been written* answered
`{ok:false}` and the page told the guest their signup had faltered. Mail is now
best-effort — the row is the commitment — and the response reports separately
what was saved and what was sent:

```json
{"ok":true,"saved":true,"welcomed":true,"notified":true}
```

**When Zoho was down, the House was told nothing.** The internal notice now
falls back to Gmail, subject-tagged so you know the Zoho token needs renewing.

---

## 2 · Deploying a change

1. Open the script (link above), select all, paste in `waitlist.gs`.
2. **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy.**
   Saving the editor does **not** update the live `/exec` URL. The URL does not
   change, so nothing in the HTML needs touching.
3. Run **`selfTest`** (Run ▸ `selfTest`). It posts a real waitlist signup to
   your own address, then deletes the test row. The execution log reports
   whether the row was written, the welcome letter sent, and the notice
   delivered — check your inbox for both emails.

---

## 3 · Confirming it is alive

Open the Web App URL in a browser. A healthy deployment answers:

```json
{"ok":true,"message":"Maison d'Vue waitlist endpoint is live.",
 "waitlist":47,"letters":3,"reviews":1,"welcomeLetter":"on"}
```

The counts are live row counts. Watching `waitlist` rise is the simplest proof
the form is collecting.

- **A sign-in page** — the deployment is no longer set to *Anyone*.
- **`ok:false` with an error** — the reason is in the `error` field.
- **Counts that never move** while Mailchimp gains subscribers — see §5.

---

## 4 · Renewing the Zoho token

Mail credentials live in **Project Settings ▸ Script Properties**, never in this
repo: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`,
`ZOHO_ACCOUNT_ID`. Run **`testGetToken`** — it logs a fresh access token, or
throws with Zoho’s reason. A `invalid_code` / `invalid_client` error means the
refresh token has been revoked and must be reissued from the Zoho API console.

While it is broken, signups are still recorded and you are still notified —
by Gmail rather than Zoho, from your own address instead of the house one.

---

## 5 · The safety net

`index.html` does not depend on the script alone. If the endpoint errors or
cannot be reached, the signup falls back to posting the address into the
MAISON D’VUE Mailchimp audience (`us20`) through a hidden iframe — the same
no-server method the Founder’s Circle form uses, which no CORS policy, redirect,
or expired script URL can block.

Order of events:

1. Apps Script — sheet row, welcome letter to the guest, notice to the House.
2. Mailchimp — address captured in the audience.
3. Neither reachable *and* the browser offline — the page says so plainly rather
   than confirming a place on a list the address never reached.

The fallback runs only after the primary has failed, so nobody is written to
twice in the ordinary case.

**If addresses show up in Mailchimp but not in the sheet, the script is down.**
That is the tell — start at §3.

---

## 6 · The sheet

| Tab | Columns | Written by |
| --- | --- | --- |
| `waitlist` | Name · Email · Date · Status · Notes *(the source)* | homepage reservation form |
| `letters` | Date · Name · Email · Status · Source | product page popup |
| `reviews` | Date · Name · Rating · Review · Status · User Agent · Referrer | product page review form |

Tab names are **case-sensitive** and matched exactly; the script creates a tab
if one is missing, which is how a renamed tab quietly ends up with the real
entries going somewhere new. Rows arrive as `Pending` (waitlist, reviews) or
`Active` (letters) — the Status column is yours to edit.

Some historical waitlist rows were added by hand from DMs and use a
day-first date; script-written rows are always US-format.

---

## 7 · Settings

Top of `waitlist.gs`:

| Setting | Default | Purpose |
| --- | --- | --- |
| `SEND_WELCOME_LETTER` | `true` | The guest’s welcome letter. Set `false` only once a Mailchimp Journey is confirmed sending it. |
| `ALLOCATION_MONTH` | `'June'` | **Update when the allocation moves on** — the letter promises the guest these bottles by name. |
| `NOTIFY_EMAIL` | `hello@maisondvue.com` | Where signup notices go. |
| `FROM_EMAIL` / `FROM_NAME` | `hello@maisondvue.com` / `MAISON D'VUE` | Sender identity on Zoho mail. |
