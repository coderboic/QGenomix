"""Full-page screenshots of the running dashboard with headless Chrome (for the report and backup slides).

The page is captured at 760 px wide and 3x scale, so printed at the report's 6.4 inch text width the app's own
text is about as large as the report's text and stays sharp.

    make app            (in another terminal)
    python scripts/screenshot_app.py
"""

from __future__ import annotations

import asyncio
import base64
import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import websockets
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://localhost:8501"
SHOTS = {  # file: (url, maximum height in px)
    "app_report_asha.png": (f"{BASE}/?persona=asha_lean_high&autorun=1", 4000),
    "app_report_ravi.png": (f"{BASE}/?persona=ravi_obese_high&autorun=1", 4000),
    "app_clinician.png": (f"{BASE}/?page=Clinician%20view", 860),
}
SCALE = 3
CROPS = {  # file: (left, top, right, bottom) of app_report_asha.png in page pixels; 100 page pixels print as one inch
    "app_summary.png": (256, 222, 752, 512),
    "app_mechanisms.png": (256, 528, 752, 896),
    "app_whatif.png": (256, 1195, 752, 1350),
}


async def capture(ws_url: str, url: str, out: Path, max_h: int = 4000, wait_s: float = 25.0,
                  width: int = 760, scale: int = SCALE) -> None:
    async with websockets.connect(ws_url, max_size=64 * 1024 * 1024) as ws:
        msg_id = 0

        async def call(method: str, **params):
            nonlocal msg_id
            msg_id += 1
            await ws.send(json.dumps({"id": msg_id, "method": method, "params": params}))
            while True:
                reply = json.loads(await ws.recv())
                if reply.get("id") == msg_id:
                    return reply.get("result", {})

        await call("Page.enable")
        await call("Emulation.setDeviceMetricsOverride", width=width, height=1000, deviceScaleFactor=scale,
                   mobile=False)
        await call("Page.navigate", url=url)
        await asyncio.sleep(wait_s)  # Streamlit renders over a websocket; give the report time to finish
        await call("Runtime.evaluate", expression=(  # hide the sidebar and toolbar: the page content is the point
            "for (const s of ['[data-testid=\"stSidebar\"]', '[data-testid=\"stToolbar\"]', "
            "'[data-testid=\"stSidebarCollapsedControl\"]']) document.querySelectorAll(s)"
            ".forEach(e => e.style.display = 'none');"))
        metrics = await call("Page.getLayoutMetrics")
        height = int(metrics["cssContentSize"]["height"])
        main_h = await call("Runtime.evaluate", returnByValue=True, expression=(
            "Math.max(...[...document.querySelectorAll('section.main, [data-testid=\"stMain\"], "
            "[data-testid=\"stAppViewContainer\"] *')].map(e => e.scrollHeight || 0), 1000)"))
        height = max(height, int(main_h.get("result", {}).get("value", height)))
        await call("Emulation.setDeviceMetricsOverride", width=width, height=min(height, max_h),
                   deviceScaleFactor=scale, mobile=False)
        await asyncio.sleep(2)
        shot = await call("Page.captureScreenshot", format="png", captureBeyondViewport=True)
        out.write_bytes(base64.b64decode(shot["data"]))
        print("wrote", out.relative_to(ROOT), f"({width}x{min(height, max_h)})")


def main() -> None:
    port = 9223
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
        chrome = subprocess.Popen(["google-chrome", "--headless=new", "--disable-gpu", "--hide-scrollbars",
                                   f"--remote-debugging-port={port}", f"--user-data-dir={profile}", "about:blank"],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(50):
                try:
                    tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/json").read())
                    break
                except OSError:
                    time.sleep(0.2)
            else:
                sys.exit("Chrome did not start")
            ws_url = next(t["webSocketDebuggerUrl"] for t in tabs if t["type"] == "page")
            for name, (url, max_h) in SHOTS.items():
                asyncio.run(capture(ws_url, url, ROOT / "figures" / name, max_h))
        finally:
            chrome.terminate()
            chrome.wait(timeout=10)
    crop()


def crop() -> None:
    """Cut the parts of the Asha report used in the document and the slides."""
    page = Image.open(ROOT / "figures" / "app_report_asha.png").convert("RGB")
    for name, box in CROPS.items():
        page.crop(tuple(SCALE * v for v in box)).save(ROOT / "figures" / name, dpi=(300, 300))
        print("wrote", name)


if __name__ == "__main__":
    main()
