# MAISON D’VUE — Waitlist & Letters

The homepage reservation form (`index.html`) and the Letters and review forms
on `product.html` all post to a single Google Apps Script Web App, with a Google
Sheet as the data store and the admin view. `waitlist.gs` is that Web App.

| File | Role |
| --- | --- |
| `index.html` | The homepage reservation form — first name, email, gift-with-purchase promise. |
| `product.html` | The Letters signup and the product review form (same endpoint). |
| `waitlist.gs` | The backend: sheet storage, the notice to the House, the confirmation to the subscriber. |

Every accepted signup does three things, in order:

1. **Appends a row** to the `Waitlist` tab — the address is collected.
2. **Emails `NOTIFY_EMAIL`** with who just joined, their source, and the running
   total. Replying to that notice writes to the person directly.
3. **Emails the subscriber** a confirmation in the house register.

The script returns JSON, so the page confirms a recorded signup rather than
merely a submitted one.

---

## 1 · Stand up the backend

Nothing in the script needs editing — it binds to its own sheet.

1. Open a blank **Google Sheet** (visit **sheets.new**).
2. **Extensions ▸ Apps Script**. Delete the placeholder and paste the contents
   of `waitlist.gs`. Leave `SHEET_ID` empty.
3. Run **`setup`** once (Run ▸ `setup`) and grant authorization. This builds the
   `Waitlist` and `Reviews` tabs.
4. **Deploy ▸ New deployment ▸ Web app.**
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
5. Copy the **Web App URL** and paste it into:
   - `WAITLIST_ENDPOINT` in `index.html`
   - `REVIEW_ENDPOINT` in `product.html`
6. Run **`selfTest`** (Run ▸ `selfTest`). It writes a row, sends both emails,
   removes the row again, and logs the verdict. Check the execution log and
   your inbox.

### “Who has access” is the setting that breaks waitlists

It must be **Anyone**. Set to *Anyone with a Google account*, the browser’s POST
is answered with a sign-in page instead of the script, the request fails on
CORS, and the form stops collecting addresses without any visible sign that
anything is wrong. If signups dry up, check this first.

### Re-deploy after every edit

Saving the editor does **not** update the live `/exec` URL. After changing the
script: **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy.**
The URL stays the same.

---

## 2 · Confirming it is alive

Open the Web App URL in a browser. A healthy deployment answers with JSON:

```json
{"ok":true,"service":"MAISON D'VUE waitlist","waitlist":128,"reviews":9,
 "notify":"on","confirmations":"on"}
```

- **A sign-in page** — the deployment is not set to *Anyone* (see above).
- **“Script function not found”** — the script was deployed without `doGet`, or
  an older version is still live. Re-deploy as a new version.
- **A JSON `ok:false`** — the reason is in the `error` field.

`waitlist` is the number of addresses held. Watching that number rise is the
simplest confirmation that the form is collecting.

---

## 3 · The safety net

`index.html` does not depend on the script alone. If the endpoint answers with
an error, or cannot be reached at all, the signup falls back to posting the
address straight into the MAISON D’VUE Mailchimp audience (`us20`) through a
hidden iframe — the same no-server method the Founder’s Circle form uses, and
one that no CORS policy, redirect, or expired script URL can block.

So an address is captured whether or not the script is healthy. The order is:

1. Apps Script — sheet row, notice to the House, confirmation to the subscriber.
2. Mailchimp — address captured in the audience; Mailchimp’s own opt-in
   confirmation reaches the subscriber.
3. Neither reachable *and* the browser is offline — the page says so plainly
   rather than confirming a place on a list the address never reached.

Because the fallback only runs when the primary has already failed, nobody is
written to twice in the ordinary case.

**If signups appear in Mailchimp but not in the sheet, the script is down.**
That is the tell — check §2.

---

## 4 · Settings worth knowing

Top of `waitlist.gs`:

| Setting | Default | Purpose |
| --- | --- | --- |
| `NOTIFY_EMAIL` | `hello@maisondvue.com` | Where the “someone just joined” notice goes. Comma-separate for several. `""` disables. |
| `SEND_SUBSCRIBER_CONFIRMATION` | `true` | The subscriber’s own confirmation. Set `false` only if a Mailchimp Journey takes over that email. |
| `NOTIFY_ON_REVIEW` | `true` | Also notify the House about new product reviews. |
| `REPLY_TO` | `hello@maisondvue.com` | Reply address on subscriber mail. |

Gmail caps automated sending (100/day on a consumer account, 1,500 on Workspace).
Past that the notices and confirmations stop while the rows keep being written —
addresses are never lost to a mail limit. If a launch is likely to exceed it,
set `SEND_SUBSCRIBER_CONFIRMATION = false` and let a Mailchimp Journey send the
welcome instead.

---

## 5 · The sheet

**Waitlist** — Date · First Name · Email · Source · Times Joined · Last Seen ·
Confirmation Sent · Referrer · User Agent

One row per address. A repeat signup bumps `Times Joined` and `Last Seen`
instead of adding a second row, and does not write to the person again.
`Confirmation Sent` records whether their confirmation actually went out —
a column of `Failed` means the Gmail quota is spent.

**Reviews** — Date · Name · Rating · Review · Status · Source · Referrer · User Agent

New reviews arrive as `Pending`. `Status` is yours to edit.

Export addresses with **File ▸ Download ▸ CSV** for import into Mailchimp.
