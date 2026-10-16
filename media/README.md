# /media/

Unlisted directory of video and image files served straight off GitHub
Pages, so ad platforms can fetch a creative by direct URL.

Gallery: https://maisondvue.com/media/

## How to add a video

0. **Be signed in to GitHub in that browser.** Signed out, GitHub answers
   the upload screen with "Uploads are disabled. File uploads require push
   access to this repository." Signing in is the whole fix.
1. Open the gallery and press the **+** tile. It opens GitHub's upload
   screen for this folder. (Direct link:
   https://github.com/MAISONDVUE/maisondvue.github.io/upload/main/media)
2. Drag the video in, then **Commit changes**. Over 25MB, GitHub stops
   you there with "too big" — take the git route below instead. Do not
   re-encode a master to fit this screen.
3. Wait about a minute. The gallery rebuilds itself and the new file
   appears as a tile with a Copy link button.

Every tile also carries a **Download** button, and so does the lightbox.
The files sit on the same domain as the page, so the browser saves them
straight to the device rather than opening them in a tab.

The page cannot take the upload itself. Pages is static hosting with no
server behind it, and an upload endpoint on an unlisted public page would
let anyone holding the URL write files onto the site. The + sends you to
GitHub, which already has a login in front of it.

Deleting works the same way: open the file on GitHub, hit the bin icon,
commit. The gallery drops it on the next rebuild.

## Rules for files

- **25MB is the + tile's limit, not the folder's.** GitHub's browser
  uploader rejects any single file over 25MB with a "too big" error before
  the commit ever happens. This is the limit you will actually hit, and it
  is not a reason to re-encode the file — see below.
- **100MB through git.** Pushing from a clone clears 25MB and only breaks
  at 100MB, with a warning above 50MB. This repo does not use Git LFS.
  Same folder, same URLs, no gallery changes, original bytes.
- **Lowercase, hyphenated names. No spaces, no capitals, no apostrophes.**
  `signature-banner.mp4`, never `Signature Banner.MP4`. Spaces become
  `%20` in the URL and several ad-platform fetchers choke on them.
- **`.mp4` or `.mov` for video** — `.mp4` (H.264 + AAC) is the safe
  default. Images can be `.jpg`, `.png`, `.webp`, or `.gif`.

Anything with another extension is ignored by the gallery.

### Over 25MB: put it up through git, not the browser

**Do not re-encode an ad master to fit the + tile.** The 25MB cap belongs
to GitHub's browser uploader alone. Git push clears it and only stops at
100MB. The file lands in the same folder, keeps the same URL shape, and
the gallery rebuilds itself exactly as it does for a + tile upload — the
only thing that changes is the door it came through.

The bytes go up untouched. No re-encode, no generation loss.

With GitHub Desktop (no terminal):

1. Clone `MAISONDVUE/maisondvue.github.io` if you have not already.
2. Drop the file into the `media/` folder on your machine.
3. Commit, then **Push origin**.

From a terminal:

```bash
git clone https://github.com/MAISONDVUE/maisondvue.github.io.git
cd maisondvue.github.io
cp ~/Desktop/your-master.mp4 media/
git add media/your-master.mp4
git commit -m "Add your-master.mp4"
git push
```

### Over 100MB

Git refuses it and this repo does not use Git LFS. GitHub Pages also caps
the whole published site at 1GB, and this repo already carries a few
hundred MB, so masters of that size do not belong here at all.

Put them on Cloudflare R2 instead — the same Cloudflare account already
runs the chat worker. R2 serves direct public URLs the ad platforms can
fetch, with no per-file ceiling worth worrying about and no re-encode.
Add the URL to the gallery by hand rather than the file.

### If a file genuinely needs to be smaller

Only for a web cut, never for a master handed to a platform. Ad platforms
take far more than 25MB — Meta accepts up to 4GB — so there is rarely a
reason to reach for this:

```bash
ffmpeg -i big.mp4 -vcodec libx264 -crf 20 -preset slow \
  -acodec aac -b:a 192k -movflags +faststart smaller.mp4
```

## Rules of the directory

- Nothing links here from the nav, footer, sitemap, or any page. The
  gallery carries `noindex, nofollow` and `robots.txt` disallows `/media/`.
- Unlisted is not private. Anyone holding a URL can fetch the file.
  Only put creative here that is cleared for public distribution.

## How the gallery is built

`.github/workflows/media-index.yml` runs `.github/scripts/build-media-index.py`
on every push that touches this folder, and commits the regenerated
`index.html`. To rebuild by hand, from the repo root:

```bash
python3 .github/scripts/build-media-index.py
```
