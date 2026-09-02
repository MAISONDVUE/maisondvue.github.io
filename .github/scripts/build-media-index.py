#!/usr/bin/env python3
"""Regenerate media/index.html from whatever is sitting in media/.

Run from the repo root. Called by .github/workflows/media-index.yml on
every push that touches media/, so the gallery never goes stale.
"""

import html
import os

BASE = "https://maisondvue.com/media/"
UPLOAD = "https://github.com/MAISONDVUE/maisondvue.github.io/upload/main/media"
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
    u = html.escape(url, quote=True)
    n = html.escape(name)
    if kind == "video":
        # #t=0.1 makes the browser seek a hair in and paint that frame,
        # rather than leaving the tile black until someone hovers it.
        media = (
            f'<video src="{u}#t=0.1" preload="metadata" muted playsinline '
            f'loop></video><span class="play" aria-hidden="true"></span>'
        )
    else:
        media = f'<img src="{u}" alt="{n}" loading="lazy">'
    return f"""    <li class="card">
      <button class="tile" type="button" data-kind="{kind}" data-url="{u}" data-name="{n}">
        {media}
      </button>
      <p class="name" title="{n}">{n}</p>
      <p class="meta">{kind} &middot; {human_size(size)}</p>
      <div class="actions">
        <button class="btn copy" type="button" data-url="{u}">Copy link</button>
        <a class="btn dl" href="{u}" download="{n}">Download</a>
      </div>
    </li>"""


def build(items):
    add_tile = f"""    <li class="card add">
      <a class="tile addtile" href="{UPLOAD}" target="_blank" rel="noopener">
        <span class="plus" aria-hidden="true">+</span>
        <span class="addlabel">Add a video</span>
      </a>
      <p class="name">Upload</p>
      <p class="meta">opens GitHub &middot; sign in first &middot; 25 MB a file, max</p>
    </li>"""

    grid = "\n".join([add_tile] + [card(*i) for i in items])
    count = (
        f'{len(items)} file{"s" if len(items) != 1 else ""}'
        if items
        else "Nothing here yet"
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
    margin: 0; padding: 30px 26px 70px;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #ecebe6; background: #121109;
  }}
  header {{ max-width: 1500px; margin: 0 auto 26px; }}
  h1 {{ margin: 0 0 6px; font-size: 21px; font-weight: 500; letter-spacing: .04em; }}
  .sub {{ margin: 0; color: #8b8578; font-size: 13px; }}
  .count {{ margin: 14px 0 0; color: #8b8578; font-size: 13px; }}

  .grid {{
    list-style: none; margin: 0 auto; padding: 0; max-width: 1500px;
    display: grid; gap: 22px;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }}
  .card {{ min-width: 0; }}

  .tile {{
    display: block; position: relative; width: 100%; padding: 0;
    aspect-ratio: 16 / 9; overflow: hidden; cursor: pointer;
    background: #000; border: 1px solid #2b2920; border-radius: 9px;
  }}
  .tile video, .tile img {{
    width: 100%; height: 100%; object-fit: cover; display: block;
  }}
  .tile:hover {{ border-color: #6d6552; }}
  .tile:focus-visible {{ outline: 2px solid #c9c2ae; outline-offset: 2px; }}

  .play {{
    position: absolute; inset: 0; margin: auto; width: 54px; height: 54px;
    border-radius: 50%; background: rgba(12,11,7,.62);
    border: 1px solid rgba(236,235,230,.45);
    transition: opacity .18s;
  }}
  .play::after {{
    content: ''; position: absolute; inset: 0; margin: auto;
    width: 0; height: 0; margin-left: 21px;
    border-left: 15px solid #ecebe6;
    border-top: 9px solid transparent;
    border-bottom: 9px solid transparent;
  }}
  .tile:hover .play {{ opacity: 0; }}

  .addtile {{
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 8px; text-decoration: none;
    background: #191811; border: 1px dashed #4a463a; color: #a8a292;
  }}
  .addtile:hover {{ border-color: #c9c2ae; color: #ecebe6; background: #1f1e15; }}
  .plus {{ font-size: 46px; line-height: 1; font-weight: 200; }}
  .addlabel {{ font-size: 13px; letter-spacing: .04em; }}

  .name {{
    margin: 11px 0 2px; font-size: 14px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }}
  .meta {{ margin: 0 0 10px; color: #8b8578; font-size: 12px; }}

  .actions {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }}
  .btn {{
    display: block; width: 100%; padding: 10px 6px; font: inherit; font-size: 13px;
    text-align: center; text-decoration: none; cursor: pointer;
    border: 0; border-radius: 5px;
  }}
  .copy {{ color: #121109; background: #c9c2ae; }}
  .copy:hover {{ background: #e0d9c4; }}
  .copy.done {{ background: #7f9b74; color: #fff; }}
  .dl {{ color: #ecebe6; background: #2b2920; border: 1px solid #423f33; }}
  .dl:hover {{ background: #383528; }}

  dialog {{
    padding: 0; border: 0; background: transparent; max-width: 92vw; width: 1100px;
  }}
  dialog::backdrop {{ background: rgba(8,7,4,.9); }}
  dialog video, dialog img {{
    width: 100%; max-height: 78vh; display: block;
    background: #000; border-radius: 9px;
  }}
  .bar {{
    display: flex; gap: 12px; align-items: center; justify-content: space-between;
    margin-top: 12px; color: #ecebe6;
  }}
  .bar p {{ margin: 0; font-size: 14px; overflow: hidden; text-overflow: ellipsis; }}
  .bar button, .bar a {{
    flex: none; padding: 9px 16px; font: inherit; font-size: 13px; cursor: pointer;
    text-decoration: none; border: 0; border-radius: 5px;
    background: #c9c2ae; color: #121109;
  }}
  .bar #vdl {{ background: #2b2920; color: #ecebe6; border: 1px solid #423f33; }}
  .bar .close {{ background: #2b2920; color: #ecebe6; }}
</style>
</head>
<body>
<header>
  <h1>Media</h1>
  <p class="sub">Direct file URLs for ad platforms. Unlisted &mdash; anyone holding a link can view the file.</p>
  <p class="sub">Adding a file needs you signed in to GitHub. Signed out, the + lands on &ldquo;Uploads are disabled&rdquo;.</p>
  <p class="sub">The + hands off to GitHub&rsquo;s browser uploader, which refuses anything over <strong>25 MB a file</strong>. Compress first &mdash; the recipe is in media/README.md.</p>
  <p class="count">{count}</p>
</header>

<ul class="grid">
{grid}
</ul>

<dialog id="viewer">
  <div id="stage"></div>
  <div class="bar">
    <p id="vname"></p>
    <button type="button" id="vcopy">Copy link</button>
    <a id="vdl" download>Download</a>
    <button type="button" class="close" id="vclose">Close</button>
  </div>
</dialog>

<script>
(function () {{
  function flash(btn, label) {{
    var was = btn.textContent;
    btn.textContent = label;
    btn.classList.add('done');
    setTimeout(function () {{
      btn.textContent = was;
      btn.classList.remove('done');
    }}, 1400);
  }}

  function copy(url, btn) {{
    if (navigator.clipboard && window.isSecureContext) {{
      navigator.clipboard.writeText(url).then(
        function () {{ flash(btn, 'Copied'); }},
        function () {{ legacy(url, btn); }}
      );
    }} else {{
      legacy(url, btn);
    }}
  }}

  function legacy(url, btn) {{
    var f = document.createElement('textarea');
    f.value = url;
    f.setAttribute('readonly', '');
    f.style.position = 'fixed';
    f.style.opacity = '0';
    document.body.appendChild(f);
    f.select();
    try {{ document.execCommand('copy'); flash(btn, 'Copied'); }} catch (e) {{}}
    document.body.removeChild(f);
  }}

  document.querySelectorAll('.copy').forEach(function (btn) {{
    btn.addEventListener('click', function () {{ copy(btn.dataset.url, btn); }});
  }});

  // Hover preview on the video tiles.
  document.querySelectorAll('.tile video').forEach(function (v) {{
    var tile = v.closest('.tile');
    tile.addEventListener('mouseenter', function () {{
      var p = v.play();
      if (p && p.catch) {{ p.catch(function () {{}}); }}
    }});
    tile.addEventListener('mouseleave', function () {{
      v.pause();
      v.currentTime = 0;
    }});
  }});

  var dlg = document.getElementById('viewer');
  var stage = document.getElementById('stage');
  var vname = document.getElementById('vname');
  var vcopy = document.getElementById('vcopy');
  var vdl = document.getElementById('vdl');
  var current = '';

  document.querySelectorAll('.tile[data-url]').forEach(function (tile) {{
    tile.addEventListener('click', function () {{
      current = tile.dataset.url;
      vname.textContent = tile.dataset.name;
      vdl.href = current;
      vdl.setAttribute('download', tile.dataset.name);
      stage.innerHTML = tile.dataset.kind === 'video'
        ? '<video src="' + current + '" controls autoplay playsinline></video>'
        : '<img src="' + current + '" alt="">';
      if (dlg.showModal) {{ dlg.showModal(); }} else {{ window.open(current, '_blank'); }}
    }});
  }});

  vcopy.addEventListener('click', function () {{ copy(current, vcopy); }});
  document.getElementById('vclose').addEventListener('click', function () {{ dlg.close(); }});
  dlg.addEventListener('click', function (e) {{ if (e.target === dlg) {{ dlg.close(); }} }});
  dlg.addEventListener('close', function () {{ stage.innerHTML = ''; }});
}})();
</script>
</body>
</html>
"""


if __name__ == "__main__":
    with open(os.path.join(MEDIA_DIR, "index.html"), "w") as f:
        f.write(build(collect()))
