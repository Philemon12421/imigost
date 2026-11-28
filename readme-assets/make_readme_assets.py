"""Generates the animated SVGs used at the top of README.md (light and dark versions).

Edit the taglines or colours below, then run:  python3 make_readme_assets.py
It writes header-light.svg, header-dark.svg, features-light.svg and features-dark.svg next to this file.
"""

FONT = "system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"
TILES = [("#ff9a56", "#b44bd4"), ("#1aa6b7", "#0f4c81"), ("#8fd19e", "#2f6f4a"), ("#ffd6e8", "#ff4d9a"), ("#ffe14d", "#f59e0b")]


def palette(dark):
    return dict(
        ink="#f0f3f6" if dark else "#15181a",
        muted="#9198a1" if dark else "#59636e",
        accent="#7c86ff" if dark else "#3a47f0",
        tile="#4f5bff" if dark else "#3a47f0",
        card="#161b22" if dark else "#f6f8fa",
        cardline="#30363d" if dark else "#d0d7de",
        pill="#0d1117" if dark else "#ffffff",
        bar="#30363d" if dark else "#d0d7de",
        github="#c9d1d9" if dark else "#24292f",
    )


def gradients(prefix, pairs):
    out = []
    for i, (a, b) in enumerate(pairs):
        out.append(f'<linearGradient id="{prefix}{i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>')
    return "\n    ".join(out)


# ---------------------------------------------------------------- header
def header(dark):
    c = palette(dark)
    W, H = 900, 372
    tw, th, gap = 112, 84, 20
    x0 = (W - (5 * tw + 4 * gap)) / 2          # 130
    ty = 262
    step = tw + gap                            # 132

    # the focus frame that hops from photo to photo
    fx, fy, fw, fh, arm = x0 - 8, ty - 8, tw + 16, th + 16, 22
    frame = (f"M{fx} {fy+arm}V{fy}H{fx+arm} M{fx+fw-arm} {fy}H{fx+fw}V{fy+arm} "
             f"M{fx+fw} {fy+fh-arm}V{fy+fh}H{fx+fw-arm} M{fx+arm} {fy+fh}H{fx}V{fy+fh-arm}")
    cx, cy = x0 + tw / 2, ty + th / 2

    hop, dot = [], []
    for i in range(5):
        p, x = i * 20, i * step
        hop += [f"{p}%{{transform:translateX({x}px) scale(1.14)}}",
                f"{p+3}%{{transform:translateX({x}px) scale(1)}}",
                f"{p+17}%{{transform:translateX({x}px) scale(1)}}"]
        dot += [f"{p}%{{opacity:0;transform:scale(0)}}",
                f"{p+3}%{{opacity:1;transform:scale(1.4)}}",
                f"{p+5}%{{opacity:1;transform:scale(1)}}",
                f"{p+16}%{{opacity:1;transform:scale(1)}}",
                f"{p+19}%{{opacity:0;transform:scale(1)}}"]
    hop.append("100%{transform:translateX(0px) scale(1.14)}")
    dot.append("100%{opacity:0;transform:scale(0)}")

    tiles = []
    for i, _ in enumerate(TILES):
        x = x0 + i * step
        tiles.append(
            f'<g class="pop" style="animation-delay:{0.5 + i * 0.09:.2f}s">'
            f'<rect x="{x}" y="{ty}" width="{tw}" height="{th}" rx="12" fill="url(#t{i})"/>'
            f'<circle cx="{x + 82}" cy="{ty + 27}" r="8" fill="#fff" opacity=".85"/>'
            f'<path d="M{x} {ty + th - 12}Q{x} {ty + th} {x + 12} {ty + th}H{x + tw - 12}Q{x + tw} {ty + th} {x + tw} {ty + th - 12}'
            f'V{ty + th - 24}L{x + 76} {ty + 40}L{x + 50} {ty + 62}L{x + 34} {ty + 50}L{x} {ty + 70}Z" fill="#fff" opacity=".32"/>'
            f'</g>')

    taglines = ["Search free photos from Unsplash.",
                "Build a link-in-bio page with 36 looks.",
                "Crop, compress and convert photos in your browser.",
                "Test your internet speed. Install it as an app."]
    tag_svg = "\n  ".join(
        f'<text class="tag t{i+1}" x="{W/2}" y="212" text-anchor="middle" font-size="22" fill="{c["muted"]}" style="animation-delay:{i*3}s">{t}</text>'
        for i, t in enumerate(taglines))

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="title desc">
  <title id="title">ImageSearch</title>
  <desc id="desc">The ImageSearch logo, a camera viewfinder locking focus, above rotating lines about photo search, link pages, photo tools and the speed test.</desc>
  <defs>
    {gradients("t", TILES)}
  </defs>
  <style>
    text {{ font-family: {FONT}; }}
    .fb {{ transform-box: fill-box; transform-origin: center; }}
    .pop {{ transform-box: fill-box; transform-origin: center; animation: pop .6s cubic-bezier(.2,1.4,.4,1) both; }}
    @keyframes pop {{ from {{ opacity: 0; transform: scale(.6); }} to {{ opacity: 1; transform: scale(1); }} }}
    @keyframes rise {{ from {{ opacity: 0; transform: translateY(12px); }} to {{ opacity: 1; transform: translateY(0); }} }}

    .logo {{ transform-box: fill-box; transform-origin: center; animation: pop .7s cubic-bezier(.2,1.5,.4,1) both; }}
    .brackets {{ transform-box: fill-box; transform-origin: center; animation: hunt 6s cubic-bezier(.3,.7,.3,1) infinite .4s both; }}
    .lens {{ transform-box: fill-box; transform-origin: center; animation: lock 6s ease-out infinite .4s both; }}
    @keyframes hunt {{
      0% {{ transform: scale(1.5); opacity: 0; }} 6% {{ opacity: 1; }} 14% {{ transform: scale(.86); }}
      20% {{ transform: scale(1.1); }} 26% {{ transform: scale(1); }} 84% {{ transform: scale(1); opacity: 1; }}
      94% {{ transform: scale(1); opacity: 0; }} 100% {{ transform: scale(1.5); opacity: 0; }}
    }}
    @keyframes lock {{
      0%, 22% {{ transform: scale(0); opacity: 0; }} 27% {{ transform: scale(1.4); opacity: 1; }}
      32% {{ transform: scale(1); opacity: 1; }} 84% {{ opacity: 1; }} 94% {{ transform: scale(1); opacity: 0; }}
      100% {{ transform: scale(0); opacity: 0; }}
    }}

    .word {{ animation: rise .8s ease-out .25s both; }}

    .tag {{ animation: tag 12s ease-in-out infinite both; }}
    @keyframes tag {{
      0% {{ opacity: 0; transform: translateY(8px); }} 4% {{ opacity: 1; transform: translateY(0); }}
      21% {{ opacity: 1; transform: translateY(0); }} 25% {{ opacity: 0; transform: translateY(-8px); }}
      100% {{ opacity: 0; transform: translateY(-8px); }}
    }}

    .hopwrap {{ animation: fadein .35s ease-out 1.1s both; }}
    @keyframes fadein {{ from {{ opacity: 0; }} to {{ opacity: 1; }} }}
    .hop {{ transform-box: fill-box; transform-origin: center; animation: hop 10s cubic-bezier(.5,0,.2,1) infinite 1.2s both; }}
    @keyframes hop {{ {" ".join(hop)} }}
    .hopdot {{ transform-box: fill-box; transform-origin: center; animation: hopdot 10s ease-out infinite 1.2s both; }}
    @keyframes hopdot {{ {" ".join(dot)} }}

    @media (prefers-reduced-motion: reduce) {{
      * {{ animation: none !important; }}
      .t2, .t3, .t4 {{ opacity: 0; }}
    }}
  </style>

  <!-- logo -->
  <g transform="translate({W/2 - 36} 26) scale(1.125)">
    <g class="logo">
      <rect width="64" height="64" rx="14" fill="{c['tile']}"/>
      <path class="brackets" d="M14 24V14h10M40 14h10v10M50 40v10H40M24 50H14V40" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle class="lens" cx="32" cy="32" r="6.5" fill="#fff"/>
    </g>
  </g>

  <text class="word" x="{W/2}" y="170" text-anchor="middle" font-size="48" font-weight="800" letter-spacing="-1.6" fill="{c['ink']}">ImageSearch</text>

  {tag_svg}

  <!-- photos and the focus frame -->
  {chr(10).join("  " + t for t in tiles).strip()}

  <g class="hopwrap"><g class="hop">
    <path d="{frame}" fill="none" stroke="{c['accent']}" stroke-width="4" stroke-linecap="round"/>
    <circle class="hopdot" cx="{cx}" cy="{cy}" r="6" fill="{c['accent']}"/>
  </g></g>
</svg>
'''


# -------------------------------------------------------------- features
def features(dark):
    c = palette(dark)
    W, H = 880, 214
    cw, gap = 202, 24
    xs = [i * (cw + gap) for i in range(4)]

    def card(i, title, l1, l2, body):
        return f'''  <g transform="translate({xs[i]} 0)">
    <rect width="{cw}" height="{H}" rx="16" fill="{c['card']}" stroke="{c['cardline']}"/>
    {body}
    <text x="{cw/2}" y="152" text-anchor="middle" font-size="17" font-weight="700" fill="{c['ink']}">{title}</text>
    <text x="{cw/2}" y="175" text-anchor="middle" font-size="13" fill="{c['muted']}">{l1}</text>
    <text x="{cw/2}" y="193" text-anchor="middle" font-size="13" fill="{c['muted']}">{l2}</text>
  </g>'''

    # 1. photo search: tiles pop in one after another
    spec = [(27, 22, 70, 52, 0), (27, 80, 70, 36, 1), (105, 22, 70, 34, 2), (105, 62, 70, 54, 3)]
    b1 = "\n    ".join(
        f'<rect class="tp" style="animation-delay:{k*0.22:.2f}s" x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="url(#f{g})"/>'
        for k, (x, y, w, h, g) in enumerate(spec))

    # 2. link page: link buttons slide in
    rows = [("url(#ig)", 24), ("#ff0000", 58), (c["github"], 92)]
    b2 = "\n    ".join(
        f'<g class="sl" style="animation-delay:{k*0.35:.2f}s"><rect x="27" y="{y}" width="148" height="26" rx="13" fill="{c["pill"]}" stroke="{c["cardline"]}"/>'
        f'<circle cx="44" cy="{y+13}" r="9" fill="{col}"/><rect x="62" y="{y+9.5}" width="{86 - k*10}" height="7" rx="3.5" fill="{c["bar"]}"/></g>'
        for k, (col, y) in enumerate(rows))

    # 3. tools: the crop frame changes shape
    shapes = [("1:1", 54, 22, 94, 94), ("9:16", 75.05, 22, 52.9, 94), ("16:9", 27, 27.4, 148, 83.25)]
    seq = [shapes[0], shapes[0], shapes[1], shapes[1], shapes[2], shapes[2], shapes[0]]
    kt = "0;.25;.33;.58;.66;.91;1"
    ks = ";".join(["0 0 1 1" if k % 2 == 0 else ".5 0 .2 1" for k in range(6)])

    def vals(idx):
        return ";".join(str(s[idx]) for s in seq)

    labels = "\n    ".join(
        f'<text class="lb" style="animation-delay:{k*3}s" x="{cw/2}" y="135" text-anchor="middle" font-size="12" font-weight="600" fill="{c["muted"]}">{s[0]}</text>'
        for k, s in enumerate(shapes))
    b3 = f'''<rect x="27" y="22" width="148" height="94" rx="8" fill="url(#f1)"/>
    <rect x="54" y="22" width="94" height="94" fill="{c['accent']}" fill-opacity=".16" stroke="{c['accent']}" stroke-width="3" rx="3">
      <animate attributeName="x" dur="9s" repeatCount="indefinite" values="{vals(1)}" keyTimes="{kt}" calcMode="spline" keySplines="{ks}"/>
      <animate attributeName="y" dur="9s" repeatCount="indefinite" values="{vals(2)}" keyTimes="{kt}" calcMode="spline" keySplines="{ks}"/>
      <animate attributeName="width" dur="9s" repeatCount="indefinite" values="{vals(3)}" keyTimes="{kt}" calcMode="spline" keySplines="{ks}"/>
      <animate attributeName="height" dur="9s" repeatCount="indefinite" values="{vals(4)}" keyTimes="{kt}" calcMode="spline" keySplines="{ks}"/>
    </rect>
    {labels}'''

    # 4. extension: right-click an image, a menu appears
    b4 = f'''<rect x="27" y="22" width="148" height="94" rx="8" fill="{c['pill']}" stroke="{c['cardline']}"/>
    <rect x="39" y="34" width="70" height="46" rx="5" fill="url(#f2)"/>
    <rect x="39" y="90" width="100" height="6" rx="3" fill="{c['bar']}"/>
    <rect x="39" y="102" width="68" height="6" rx="3" fill="{c['bar']}"/>
    <g class="menu" transform="translate(92 66)">
      <rect width="86" height="46" rx="8" fill="{c['pill']}" stroke="{c['cardline']}"/>
      <rect class="hl" x="5" y="6" width="76" height="16" rx="5" fill="{c['accent']}" fill-opacity=".18"/>
      <rect x="11" y="12" width="52" height="5" rx="2.5" fill="{c['accent']}"/>
      <rect x="11" y="30" width="60" height="5" rx="2.5" fill="{c['bar']}"/>
    </g>
    <g class="cur"><path d="M0 0V17L4.6 12.6L8 20.6L11.2 19.2L7.8 11.4H14Z" fill="{c['ink']}" stroke="{c['pill']}" stroke-width="1.2" stroke-linejoin="round"/></g>'''

    f_tiles = [("#ff9a56", "#b44bd4"), ("#1aa6b7", "#0f4c81"), ("#8fd19e", "#2f6f4a"), ("#ffd6e8", "#ff4d9a")]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="title desc">
  <title id="title">What is inside ImageSearch</title>
  <desc id="desc">Four small animated cards: photo search, the link page builder, photo tools with a crop frame that changes shape, and the Chrome extension with a right-click menu.</desc>
  <defs>
    {gradients("f", f_tiles)}
    <linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f9a03a"/><stop offset=".5" stop-color="#e1306c"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>
  </defs>
  <style>
    text {{ font-family: {FONT}; }}
    .tp, .sl, .menu, .hl {{ transform-box: fill-box; }}
    .tp {{ transform-origin: center; animation: tp 6s ease-out infinite both; }}
    @keyframes tp {{ 0% {{ opacity: 0; transform: scale(.5); }} 6% {{ opacity: 1; transform: scale(1.06); }} 9% {{ transform: scale(1); }}
      82% {{ opacity: 1; transform: scale(1); }} 92% {{ opacity: 0; transform: scale(.92); }} 100% {{ opacity: 0; }} }}
    .sl {{ animation: sl 6s ease-out infinite both; }}
    @keyframes sl {{ 0% {{ opacity: 0; transform: translateX(-18px); }} 9% {{ opacity: 1; transform: translateX(0); }}
      82% {{ opacity: 1; transform: translateX(0); }} 92% {{ opacity: 0; transform: translateX(10px); }} 100% {{ opacity: 0; }} }}
    .lb {{ opacity: 0; animation: lb 9s ease-in-out infinite both; }}
    @keyframes lb {{ 0% {{ opacity: 0; }} 2% {{ opacity: 1; }} 31% {{ opacity: 1; }} 34% {{ opacity: 0; }} 100% {{ opacity: 0; }} }}
    .cur {{ animation: cur 6s cubic-bezier(.5,0,.2,1) infinite both; }}
    @keyframes cur {{
      0% {{ opacity: 0; transform: translate(176px,112px); }} 4% {{ opacity: 1; }} 24% {{ transform: translate(84px,58px) scale(1); }}
      28% {{ transform: translate(84px,58px) scale(.86); }} 32% {{ transform: translate(84px,58px) scale(1); }}
      82% {{ opacity: 1; transform: translate(84px,58px); }} 92% {{ opacity: 0; transform: translate(84px,58px); }} 100% {{ opacity: 0; transform: translate(176px,112px); }}
    }}
    .menu {{ transform-origin: 0 0; animation: menu 6s ease-out infinite both; }}
    @keyframes menu {{ 0%, 32% {{ opacity: 0; transform: translate(92px,66px) scale(.7); }} 38% {{ opacity: 1; transform: translate(92px,66px) scale(1); }}
      82% {{ opacity: 1; transform: translate(92px,66px) scale(1); }} 92% {{ opacity: 0; transform: translate(92px,66px) scale(1); }} 100% {{ opacity: 0; }} }}
    .hl {{ animation: hl 6s ease-in-out infinite both; }}
    @keyframes hl {{ 0%, 46% {{ opacity: 0; }} 52% {{ opacity: 1; }} 82% {{ opacity: 1; }} 92%, 100% {{ opacity: 0; }} }}
    @media (prefers-reduced-motion: reduce) {{
      * {{ animation: none !important; }}
      .lb {{ opacity: 0; }}
      .cur {{ transform: translate(84px,58px); }}
    }}
  </style>
{card(0, "Photo search", "Free photos from Unsplash", "in a fast, installable app", b1)}
{card(1, "Link page", "36 looks, real brand icons,", "one link for everything", b2)}
{card(2, "Photo tools", "Crop, compress, convert,", "and a speed test", b3)}
{card(3, "Chrome extension", "Right-click any image to", "crop or compress it", b4)}
</svg>
'''


if __name__ == "__main__":
    import os
    out = os.path.dirname(os.path.abspath(__file__)) + os.sep
    for dark in (False, True):
        name = "dark" if dark else "light"
        open(out + f"header-{name}.svg", "w").write(header(dark))
        open(out + f"features-{name}.svg", "w").write(features(dark))
    print("written")
