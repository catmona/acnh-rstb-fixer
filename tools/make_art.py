"""Render the README banner (same look as the QoL and Jubbsticks patcher READMEs) with headless Chrome.
Usage: python tools/make_art.py   (needs Chrome; writes img/banner.png)"""
import os, subprocess, tempfile, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
FONTS = '<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito:wght@500;700;800&display=swap" rel="stylesheet">'
# The size tag from the page's badge (index.html).
TAG = ('<svg viewBox="0 0 64 64"><path d="M8 14c0-3 3-6 6-6h20l22 22c2 2 2 5 0 7L37 56c-2 2-5 2-7 0L8 34z" fill="#f2a541"/>'
       '<path d="M8 34V14c0-3 3-6 6-6h20" fill="none" stroke="#d0852a" stroke-width="3" stroke-linecap="round"/>'
       '<circle cx="20" cy="20" r="5" fill="#fffaeb"/>'
       '<path d="M27 38l8-8M32 44l12-12M38 49l7-7" stroke="#fffaeb" stroke-width="3.5" stroke-linecap="round"/></svg>')
GRASS = ("url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='%23b9dc9b'%3E"
         "%3Cpath d='M30 12c-9 6-11 17-5 26 9 0 15-8 14-18-2-4-5-7-9-8z'/%3E%3Cpath d='M90 72c-9 6-11 17-5 26 9 0 15-8 14-18-2-4-5-7-9-8z' transform='rotate(35 90 85)'/%3E"
         "%3C/g%3E%3Cg fill='%23ffffff' opacity='.45'%3E%3Ccircle cx='88' cy='22' r='3'/%3E%3Ccircle cx='24' cy='88' r='3'/%3E%3C/g%3E%3C/svg%3E\")")

BANNER = f"""<!doctype html><html><head><meta charset="utf-8">{FONTS}<style>
body {{ margin: 0; width: 1280px; height: 480px; overflow: hidden; background-color: #cfe8b6; background-image: {GRASS}; background-size: 150px; position: relative; }}
.card {{ position: absolute; left: 48px; top: 58px; width: 760px; background: #fff8e8; border-radius: 30px; padding: 34px 40px 30px;
        box-shadow: 0 6px 0 #e6dbbb, 0 18px 40px rgba(75,110,50,.25); }}
.badge {{ position: absolute; left: -22px; top: -30px; width: 92px; height: 92px; border-radius: 50%; background: #fff8e8; display: grid; place-items: center;
         box-shadow: 0 4px 0 #e6dbbb, 0 10px 24px rgba(75,110,50,.2); }}
.badge svg {{ width: 56px; height: 56px; }}
.kick {{ display: inline-block; margin-left: 52px; padding: 3px 14px; border-radius: 999px; background: #6dbb4f; color: #fff; font: 800 17px/1.5 Nunito, sans-serif; letter-spacing: .03em; }}
.unoff {{ display: inline-block; margin-left: 8px; padding: 3px 14px; border-radius: 999px; background: #f2a541; color: #fff; font: 800 17px/1.5 Nunito, sans-serif; letter-spacing: .03em; }}
h1 {{ margin: 14px 0 6px; font: 600 54px/1.08 Fredoka, sans-serif; color: #6b5236; }}
h1 b {{ color: #4b9435; font-weight: 600; }}
.sub {{ margin: 0 0 18px; font: 800 22px/1.4 Nunito, sans-serif; color: #95805f; }}
.pills {{ display: flex; flex-wrap: wrap; gap: 10px; }}
.pills span {{ padding: 5px 16px; border-radius: 999px; background: #fff; border: 3px solid #6dbb4f; box-shadow: 0 3px 0 #6dbb4f; color: #4b9435; font: 600 19px/1.3 Fredoka, sans-serif; }}
.big {{ position: absolute; right: 70px; top: 60px; width: 330px; height: 330px; transform: rotate(10deg); }}
</style></head><body>
<svg class="big" viewBox="0 0 64 64">{TAG[24:]}
<div class="card"><div class="badge">{TAG}</div>
<span class="kick">ACNH 3.0 &middot; ANY MOD SET</span><span class="unoff">IN YOUR BROWSER</span>
<h1>ACNH RSTB Fixer<br><b>one size table, every mod</b></h1>
<p class="sub">So mods stop crashing each other over the size table</p>
<div class="pills"><span>Peanuts</span><span>Switch</span><span>Eden &amp; Citron</span><span>Ryujinx</span></div>
</div></body></html>"""

os.makedirs(os.path.join(ROOT, 'img'), exist_ok=True)
with tempfile.TemporaryDirectory() as d:
    p = os.path.join(d, 'a.html'); open(p, 'w', encoding='utf-8').write(BANNER)
    png = os.path.join(d, 'a.png')
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--virtual-time-budget=4000',
                    '--window-size=1280,480', f'--screenshot={png}', 'file:///' + p.replace('\\', '/')], check=True, capture_output=True)
    out = os.path.join(ROOT, 'img', 'banner.png'); shutil.copy(png, out); print(out)
