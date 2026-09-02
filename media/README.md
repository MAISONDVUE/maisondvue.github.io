# /media/

Unlisted static directory for video and image files served directly off
GitHub Pages, so ad platforms (Meta, TikTok, YouTube, programmatic vendors)
can fetch a creative by absolute URL.

Base URL: https://maisondvue.com/media/

## Constraints

- **Under 100MB per file.** GitHub blocks any file over 100MB on push and
  warns above 50MB. This repo does not use Git LFS. Compress before adding.
- **Lowercase, hyphenated filenames. No spaces, no uppercase, no
  underscores, no apostrophes.** `signature-banner-16x9.mp4`, never
  `Signature Banner 16x9.MP4`. Spaces become `%20` in the URL and several
  ad-platform fetchers reject or mangle them.
- **`.mp4` or `.mov` only** for video. `.mp4` (H.264 + AAC) is the safe
  default; `.mov` is accepted but not every platform ingests it.
  Images are `.jpg` or `.png`.

## Rules of the directory

- Nothing here is linked from the nav, footer, sitemap, or any page.
  `index.html` is the only listing, and it carries `noindex, nofollow`.
  `robots.txt` disallows `/media/`.
- Unlisted is not private. Anyone with the URL can fetch these files.
  Do not put anything here that is not cleared for public distribution.
- After adding or removing a file, regenerate the listing so the index
  stays accurate.

Run this from the repo root after adding or removing files:

```bash
{
  printf '%s\n' '<!doctype html>' '<html lang="en">' '<head>' \
    '<meta charset="utf-8">' \
    '<meta name="robots" content="noindex, nofollow">' \
    '<title>media</title>' '</head>' '<body>' \
    '<p>Direct media files. Base: https://maisondvue.com/media/</p>' '<ul>'
  for f in $(ls media | grep -v '^index\.html$'); do
    printf '<li><a href="https://maisondvue.com/media/%s">https://maisondvue.com/media/%s</a></li>\n' "$f" "$f"
  done
  printf '%s\n' '</ul>' '</body>' '</html>'
} > media/index.html
```
