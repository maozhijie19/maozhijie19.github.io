#!/usr/bin/env python3
"""Build index.html and data.js from site.yml"""

import yaml
import json
import os

DIR = os.path.dirname(os.path.abspath(__file__))


def load_config():
    with open(os.path.join(DIR, "site.yml"), "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


STAR = "\u2605"
DOT = "\u00b7"
CLOSE = "\u2715"


def render_tag(t):
    cls = "tag"
    style = t.get("style")
    if style == "platform":
        cls += " tag-platform"
    elif style == "green":
        cls += " tag-green"
    elif style == "license":
        cls += " tag-license"
    return "            <span class=\"" + cls + "\">" + t["text"] + "</span>"


def render_projects(projects):
    cards = []
    for p in projects:
        warning = ""
        if p.get("warning"):
            warning = "\n          <p class=\"card-warning\">" + p["warning"] + "</p>"
        tags_html = "\n".join(render_tag(t) for t in p["tags"])
        card = (
            "      <article class=\"card\" data-project=\"" + p["name"] + "\" tabindex=\"0\" role=\"button\">\n"
            + "        <div class=\"card-header\">\n"
            + "          <div class=\"card-title\">" + p["name"] + "</div>\n"
            + "          <span class=\"card-stars\">" + STAR + " " + str(p["stars"]) + "</span>\n"
            + "        </div>\n"
            + "        <div class=\"card-body\">\n"
            + "          <p class=\"card-desc\">" + p["description"] + "</p>\n"
            + "          <div class=\"tags\">\n"
            + tags_html + "\n"
            + "          </div>" + warning + "\n"
            + "        </div>\n"
            + "      </article>"
        )
        cards.append(card)
    return "\n\n".join(cards)

THEME_SWITCHER = """      <div class="theme-switcher" id="theme-switcher">
        <button class="theme-btn" id="theme-btn" aria-label="Switch theme">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/></svg>
        </button>
        <div class="theme-dropdown" id="theme-dropdown">
          <button class="theme-option active" data-theme="default">
            <span class="theme-swatch" style="background:#041c1c"></span>
            <span class="theme-swatch" style="background:#ffe6cb"></span>
            <span>Hermes Teal</span>
          </button>
          <button class="theme-option" data-theme="midnight">
            <span class="theme-swatch" style="background:#0a0a1f"></span>
            <span class="theme-swatch" style="background:#d4c8ff"></span>
            <span>Midnight</span>
          </button>
          <button class="theme-option" data-theme="ember">
            <span class="theme-swatch" style="background:#1a0a06"></span>
            <span class="theme-swatch" style="background:#ffd8b0"></span>
            <span>Ember</span>
          </button>
          <button class="theme-option" data-theme="mono">
            <span class="theme-swatch" style="background:#0e0e0e"></span>
            <span class="theme-swatch" style="background:#eaeaea"></span>
            <span>Mono</span>
          </button>
          <button class="theme-option" data-theme="cyberpunk">
            <span class="theme-swatch" style="background:#040608"></span>
            <span class="theme-swatch" style="background:#9bffcf"></span>
            <span>Cyberpunk</span>
          </button>
          <button class="theme-option" data-theme="rose">
            <span class="theme-swatch" style="background:#1a0f15"></span>
            <span class="theme-swatch" style="background:#ffd4e1"></span>
            <span>Ros\u00e9</span>
          </button>
        </div>
      </div>"""


BACKDROPS = """<div class="backdrop-base" aria-hidden="true"></div>
<div class="backdrop-filler" aria-hidden="true"></div>
<div class="backdrop-glow" aria-hidden="true"></div>
<div class="backdrop-noise" aria-hidden="true"></div>"""


MODAL = """<div class="modal-overlay" id="project-modal" role="dialog" aria-modal="true">
  <div class="modal-box">
    <div class="modal-box-inner">
      <button class="modal-close" id="modal-close" aria-label="Close">\u2715</button>
      <div class="modal-title" id="modal-title"></div>
      <div class="modal-link-list" id="modal-links"></div>
    </div>
  </div>
</div>"""

def build_html(cfg):
    m = cfg["meta"]
    h = cfg["header"]
    p = cfg["profile"]
    f = cfg["footer"]
    ph = render_projects(cfg["projects"])

    lines = [
        "<!DOCTYPE html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="color-scheme" content="dark">',
        '<meta property="og:title" content="' + m["title"] + '">',
        '<meta property="og:description" content="' + m["description"] + '">',
        '<meta property="og:type" content="' + m["og"]["type"] + '">',
        '<meta property="og:url" content="' + m["og"]["url"] + '">',
        '<meta name="twitter:card" content="' + m["twitter"]["card"] + '">',
        '<meta name="twitter:title" content="' + m["title"] + '">',
        '<meta name="twitter:description" content="' + m["description"] + '">',
        '<link rel="icon" type="image/png" href="' + m["favicon"] + '">',
        "<title>" + m["title"] + "</title>",
        '<meta name="description" content="' + m["description"] + '">',
        '<link rel="stylesheet" href="style.css">',
        "",
        '<script async src="https://www.googletagmanager.com/gtag/js?id=' + m["analytics"] + '"></script>',
        "<script>",
        "  window.dataLayer = window.dataLayer || [];",
        "  function gtag(){dataLayer.push(arguments);}",
        "  gtag('js', new Date());",
        "  gtag('config', '" + m["analytics"] + "');",
        "</script>",
        "</head>",
        "<body>",
        "",
        BACKDROPS,
        "",
        '<div class="shell">',
        "",
        '  <header class="header">',
        '    <div class="header-brand"><strong>' + h["brand"] + "</strong> " + DOT + ' <span style="font-family:var(--font-mondwest);font-weight:400;text-transform:none;letter-spacing:0">' + h["subtitle"] + "</span></div>",
        '    <div class="header-right">',
        THEME_SWITCHER,
        "    </div>",
        "  </header>",
        "",
        '  <main class="page">',
        "",
        "    <!-- Profile -->",
        '    <section class="profile">',
        '      <div class="profile-head">',
        '        <div class="profile-avatar">' + p["avatar"] + "</div>",
        '        <div class="profile-info">',
        '          <h1 class="profile-name">' + p["name"] + ' <a class="profile-username" href="' + p["username_link"] + '" target="_blank" rel="noopener noreferrer">' + p["username"] + "</a></h1>",
        '          <p class="profile-bio">' + p["bio"] + "</p>",
        "        </div>",
        "      </div>",
        "    </section>",
        "",
        "    <!-- Projects -->",
        '    <div class="section-label">' + cfg["projects_label"] + "</div>",
        "",
        '    <div class="projects">',
        ph,
        "    </div>",
        "",
        "  </main>",
        "",
        '  <footer class="footer">',
        "    <span>" + f["copyright"] + "</span>",
        "  </footer>",
        "",
        "</div>",
        "",
        MODAL,
        "",
        '<script src="data.js"></script>',
        '<script src="script.js"></script>',
        "</body>",
        "</html>",
        "",
    ]
    return "\n".join(lines)


def build_data_js(cfg):
    projects = {}
    for p in cfg["projects"]:
        projects[p["name"]] = {
            "links": [{"t": l["text"], "u": l["url"]} for l in p.get("links", [])]
        }
    return "var PROJECTS = " + json.dumps(projects, indent=2, ensure_ascii=False) + ";\n"


def main():
    cfg = load_config()

    html = build_html(cfg)
    with open(os.path.join(DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)
    print("  index.html (%d chars)" % len(html))

    data_js = build_data_js(cfg)
    with open(os.path.join(DIR, "data.js"), "w", encoding="utf-8") as f:
        f.write(data_js)
    print("  data.js (%d chars)" % len(data_js))

    print("Done!")


if __name__ == "__main__":
    main()
