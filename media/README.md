# /media/

Unlisted directory of video and image files served straight off GitHub
Pages, so ad platforms can fetch a creative by direct URL.

Gallery: https://maisondvue.com/media/

## How to add a video

1. Go to https://github.com/MAISONDVUE/maisondvue.github.io/tree/main/media
2. **Add file** > **Upload files**, drag the video in, then **Commit changes**.
3. Wait about a minute. The gallery rebuilds itself and the new file
   appears with a Copy link button.

Deleting works the same way: open the file on GitHub, hit the bin icon,
commit. The gallery drops it on the next rebuild.

## Rules for files

- **Under 100MB.** GitHub blocks anything larger on push and warns above
  50MB. This repo does not use Git LFS, so compress before uploading.
- **Lowercase, hyphenated names. No spaces, no capitals, no apostrophes.**
  `signature-banner.mp4`, never `Signature Banner.MP4`. Spaces become
  `%20` in the URL and several ad-platform fetchers choke on them.
- **`.mp4` or `.mov` for video** — `.mp4` (H.264 + AAC) is the safe
  default. Images can be `.jpg`, `.png`, `.webp`, or `.gif`.

Anything with another extension is ignored by the gallery.

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
