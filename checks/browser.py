"""Exercise the actual web worker, canvas controls and responsive layout."""

import argparse
import os
import subprocess
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def run(chrome=None, screenshot=None):
    server = subprocess.Popen(
        ["node", "web/serve.js"],
        cwd=ROOT,
        env={**os.environ, "PORT": "0"},
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        url = server.stdout.readline().strip().split()[-1]
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=chrome, headless=True)
            page = browser.new_page(
                viewport={"width": 1360, "height": 850}, device_scale_factor=1
            )
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            expect(page.locator("#state")).to_have_text("Optimal")
            expect(page.locator("#cost")).to_have_text("62")
            page.evaluate("document.fonts.ready")
            page.get_by_role("slider", name="Replay tick").fill("6")
            expect(page.locator("#readout")).to_have_text("6 / 18 ticks")
            if screenshot:
                page.locator("#timeline").blur()
                page.screenshot(path=str(screenshot), full_page=True)
            page.get_by_role("button", name="Rewind to tick zero").click()
            page.get_by_role("button", name="Step +1").click()
            expect(page.locator("#readout")).to_have_text("1 / 18 ticks")
            page.get_by_role("button", name="▶ Play").click()
            expect(page.locator("#readout")).not_to_have_text("1 / 18 ticks")
            page.get_by_role("button", name="Ⅱ Pause").click()
            page.get_by_role("button", name="Highlight robot A1").click()
            expect(
                page.get_by_role("button", name="Highlight robot A1")
            ).to_have_attribute("aria-pressed", "true")
            page.locator("#scenario").select_option("passing-bay")
            expect(page.locator("#cost")).to_have_text("23")
            page.get_by_role("button", name="Edit floor").click()
            canvas = page.locator("#floor")
            # Open a rack, then cancel and verify the original optimum.
            canvas.press("Space")
            page.get_by_role("button", name="Cancel edits").click()
            expect(page.locator("#cost")).to_have_text("23")
            page.locator("#scenario").select_option("four-way")
            expect(page.locator("#cost")).to_have_text("15")
            # Block the center, which disconnects every arm.
            page.get_by_role("button", name="Edit floor").click()
            for key in ("ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown", "Space"):
                canvas.press(key)
            page.get_by_role("button", name="Apply & replan").click()
            expect(page.locator("#state")).to_have_text("Infeasible")
            expect(page.locator("#play")).to_be_disabled()
            page.set_viewport_size({"width": 390, "height": 844})
            page.locator("#scenario").select_option("crossdock")
            expect(page.locator("#cost")).to_have_text("62")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            assert not errors, errors
            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=8)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--chrome", help="optional system Chromium executable")
    p.add_argument("--screenshot", type=Path)
    args = p.parse_args()
    run(args.chrome, args.screenshot)
    print("Desktop, mobile, editing, playback and worker checks passed.")
