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
   you there with "too big" — compress it first, see below.
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

- **Under 25MB if you use the + tile.** GitHub's browser uploader is the
  strict one: it rejects any single file over 25MB with a "too big" error
  before the commit ever happens. This is the limit you will actually hit.
- **Under 100MB if the file goes up through git.** Pushing from a clone
  clears 25MB and only breaks at 100MB, with a warning above 50MB. This
  repo does not use Git LFS. Same folder, same URLs, no gallery changes.
- **Lowercase, hyphenated names. No spaces, no capitals, no apostrophes.**
  `signature-banner.mp4`, never `Signature Banner.MP4`. Spaces become
  `%20` in the URL and several ad-platform fetchers choke on them.
- **`.mp4` or `.mov` for video** — `.mp4` (H.264 + AAC) is the safe
  default. Images can be `.jpg`, `.png`, `.webp`, or `.gif`.

Anything with another extension is ignored by the gallery.

### Getting a file under 25MB

`ffmpeg` re-encodes a social cut down to a few MB with no visible loss:

```bash
ffmpeg -i big.mp4 -vcodec libx264 -crf 26 -preset slow \
  -acodec aac -b:a 128k -movflags +faststart small.mp4
```

Raise `-crf` (28, 30) for a smaller file, lower it (23, 20) for a cleaner
one. Check the result with `ls -lh small.mp4` before uploading. If it is
still heavy, cut the resolution too: add `-vf scale=1080:-2`.

Ad platforms take far more than 25MB — Meta accepts up to 4GB. The cap
here is GitHub's uploader, not the destination. Compressing for this
folder does not cost you anything on the platform side.

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
