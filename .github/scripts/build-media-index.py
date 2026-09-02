#!/usr/bin/env python3
"""Regenerate media/index.html from whatever is sitting in media/.

Run from the repo root. Called by .github/workflows/media-index.yml on
every push that touches media/, so the gallery never goes stale.
"""

import html
import os

BASE = "https://maisondvue.com/media/"
MEDIA_DIR = "media"
VIDEO_EXT = {".mp4", ".mov"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
SKIP = {"index.html", "README.md", ".gitkeep"}


def human_size(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024


def collect():
    items = []
    for name in sorted(os.listdir(MEDIA_DIR)):
        if name in SKIP or name.startswith("."):
            continue
        path = os.path.join(MEDIA_DIR, name)
        if not os.path.isfile(path):
            continue
        ext = os.path.splitext(name)[1].lower()
        kind = "video" if ext in VIDEO_EXT else "image" if ext in IMAGE_EXT else None
        if kind is None:
            continue
        items.append((name, kind, os.path.getsize(path)))
    return items


def card(name, kind, size):
    url = BASE + name
    safe_url = html.escape(url, quote=True)
    safe_name = html.escape(name)
    if kind == "video":
        preview = (
            f'<video src="{safe_url}" preload="metadata" muted playsinline '
            f'controls></video>'
        )
    else:
        preview = f'<img src="{safe_url}" alt="{safe_name}" loading="lazy">'
    return f"""    <li class="card">
      <div class="frame">{preview}</div>
      <p class="name">{safe_name}</p>
      <p class="meta">{kind} &middot; {human_size(size)}</p>
      <input class="url" value="{safe_url}" readonly aria-label="URL for {safe_name}">
      <button class="copy" type="button" data-url="{safe_url}">Copy link</button>
    </li>"""


def build(items):
    if items:
        body = (
            f'  <p class="count">{len(items)} '
            f'file{"s" if len(items) != 1 else ""}</p>\n'
            '  <ul class="grid">\n'
            + "\n".join(card(*i) for i in items)
            + "\n  </ul>"
        )
    else:
        body = (
            '  <p class="empty">Nothing here yet. Drop files into the '
            '<code>media</code> folder on GitHub and this page rebuilds itself.</p>'
        )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Media</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 32px 24px 64px;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #e8e6e1; background: #15140f;
  }}
  h1 {{ margin: 0 0 4px; font-size: 20px; font-weight: 500; letter-spacing: .02em; }}
  .sub {{ margin: 0 0 4px; color: #8d887c; font-size: 13px; }}
  .count {{ margin: 20px 0 12px; color: #8d887c; font-size: 13px; }}
  .empty {{ margin: 28px 0; color: #8d887c; }}
  code {{ background: #232118; padding: 1px 5px; border-radius: 3px; }}
  .grid {{
    list-style: none; margin: 0; padding: 0; display: grid; gap: 20px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }}
  .card {{ background: #1d1c15; border: 1px solid #2c2a20; border-radius: 8px; padding: 12px; }}
  .frame {{
    background: #000; border-radius: 5px; overflow: hidden;
    aspect-ratio: 16 / 10; display: flex; align-items: center; justify-content: center;
  }}
  .frame video, .frame img {{ width: 100%; height: 100%; object-fit: contain; }}
  .name {{ margin: 10px 0 2px; font-size: 14px; word-break: break-all; }}
  .meta {{ margin: 0 0 10px; color: #8d887c; font-size: 12px; }}
  .url {{
    width: 100%; padding: 7px 8px; margin-bottom: 8px;
    font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #b9b4a6; background: #14130e; border: 1px solid #2c2a20;
    border-radius: 4px;
  }}
  .copy {{
    width: 100%; padding: 9px; font-size: 13px; cursor: pointer;
    color: #15140f; background: #c9c2ae; border: 0; border-radius: 4px;
  }}
  .copy:hover {{ background: #ded7c2; }}
  .copy.done {{ background: #7f9b74; color: #fff; }}
</style>
</head>
<body>
  <h1>Media</h1>
  <p class="sub">Direct file URLs for ad platforms. Unlisted &mdash; anyone with a link can view it.</p>
  <p class="sub">Base: {BASE}</p>
{body}
<script>
document.querySelectorAll('.copy').forEach(function (btn) {{
  btn.addEventListener('click', function () {{
    var url = btn.dataset.url;
    var done = function () {{
      var was = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('done');
      setTimeout(function () {{
        btn.textContent = was;
        btn.classList.remove('done');
      }}, 1400);
    }};
    if (navigator.clipboard && window.isSecureContext) {{
      navigator.clipboard.writeText(url).then(done, function () {{ fallback(); }});
    }} else {{
      fallback();
    }}
    function fallback() {{
      var field = btn.parentNode.querySelector('.url');
      field.focus();
      field.select();
      try {{ document.execCommand('copy'); done(); }} catch (e) {{}}
    }}
  }});
}});
</script>
</body>
</html>
"""


if __name__ == "__main__":
    with open(os.path.join(MEDIA_DIR, "index.html"), "w") as f:
        f.write(build(collect()))
