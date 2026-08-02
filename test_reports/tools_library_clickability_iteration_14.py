"""
Focused Playwright verification for bug: Tools Library cards must be full-card launchers.

Target: https://prompt-web-4.preview.emergentagent.com
Scope: /app/tools-library card clickability, star-toggle isolation, search result launch,
favourites/recently-used strips, and 8 top-level sidebar navigation links.

This file mirrors the script body executed via the browser automation harness.
"""

import re
from urllib.parse import urlparse


BASE = "https://prompt-web-4.preview.emergentagent.com"


async def run(page):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    results = []
    failures = []
    original_profile = {"favourites": [], "recentlyUsed": []}

    def record(ok, label, detail=""):
        status = "PASS" if ok else "FAIL"
        print(f"{status}: {label} {detail}")
        results.append({"ok": ok, "label": label, "detail": detail})
        if not ok:
            failures.append(f"{label} {detail}")

    def path_of(url):
        return urlparse(url).path

    async def dismiss_overlays():
        try:
            await page.evaluate("""() => {
                localStorage.setItem('morris_cookie_consent', 'accepted');
                localStorage.setItem('morris_onboarding_done_v1', '1');
            }""")
        except Exception:
            pass
        for sel in ['[data-testid="cookie-accept"]', '[data-testid="onboarding-close"]', '[data-testid="onboarding-skip"]']:
            try:
                if await page.locator(sel).count() > 0:
                    await page.locator(sel).first.click(force=True)
                    await page.wait_for_timeout(150)
            except Exception:
                pass

    async def login():
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await dismiss_overlays()
        await page.wait_for_selector('[data-testid="login-form"]', timeout=10000)
        await page.locator('[data-testid="login-username"]').fill("darrenhustle300")
        await page.locator('[data-testid="login-password"]').fill("hustle1234")
        await page.locator('[data-testid="login-submit"]').click()
        await page.wait_for_url(re.compile(r".*/app.*"), timeout=15000)
        await dismiss_overlays()
        record(path_of(page.url).startswith("/app"), "Logged in and reached app", page.url)

    async def api_profile(method="GET", payload=None):
        return await page.evaluate(
            """async ({method, payload}) => {
                const token = localStorage.getItem('morris_token');
                const opts = { method, headers: { Authorization: `Bearer ${token}` } };
                if (payload) {
                  opts.headers['Content-Type'] = 'application/json';
                  opts.body = JSON.stringify(payload);
                }
                const url = method === 'GET' ? '/api/auth/me' : '/api/profile/update';
                const res = await fetch(url, opts);
                const text = await res.text();
                let data = null;
                try { data = text ? JSON.parse(text) : null; } catch { data = text; }
                return { ok: res.ok, status: res.status, data };
            }""",
            {"method": method, "payload": payload},
        )

    async def goto_library():
        await page.goto(f"{BASE}/app/tools-library", wait_until="domcontentloaded")
        await dismiss_overlays()
        await page.wait_for_selector('[data-testid="hub-tools-library"]', timeout=12000)
        await page.wait_for_timeout(200)

    async def click_card(selector, label, expected_paths=None, pos_kind="center", reset_to_library=True):
        if reset_to_library:
            await goto_library()
        loc = page.locator(selector).first
        await loc.wait_for(state="visible", timeout=8000)
        await loc.scroll_into_view_if_needed()
        box = await loc.bounding_box()
        if not box:
            record(False, f"{label} click {pos_kind}", "no bounding box")
            return
        if pos_kind == "icon":
            pos = {"x": 14, "y": min(18, max(5, box["height"] - 5))}
        elif pos_kind == "title":
            pos = {"x": min(70, box["width"] - 10), "y": min(16, box["height"] - 5)}
        elif pos_kind == "description":
            pos = {"x": min(80, box["width"] - 10), "y": min(42, box["height"] - 8)}
        elif pos_kind == "padding":
            pos = {"x": min(18, box["width"] - 8), "y": max(8, box["height"] - 10)}
        elif pos_kind == "blank-near-star":
            pos = {"x": max(8, box["width"] - 42), "y": 12}
        else:
            pos = {"x": box["width"] / 2, "y": box["height"] / 2}
        await loc.click(position=pos, force=True)
        try:
            await page.wait_for_function("() => location.pathname !== '/app/tools-library'", timeout=3000)
        except Exception:
            pass
        await page.wait_for_timeout(500)
        actual_path = path_of(page.url)
        if expected_paths:
            ok = actual_path in expected_paths
        else:
            ok = actual_path.startswith("/app/") and actual_path != "/app/tools-library" and actual_path != "/app/tool/undefined"
        body_text = await page.locator("body").inner_text(timeout=3000)
        ok = ok and "Tool not found" not in body_text
        record(ok, f"{label} click {pos_kind}", f"=> {actual_path}")

    try:
        await login()

        profile = await api_profile("GET")
        if not profile["ok"]:
            record(False, "Fetched original profile", f"status={profile['status']}")
            raise AssertionError("Could not fetch original profile")
        original_profile = {
            "favourites": profile["data"].get("favourites") if isinstance(profile["data"].get("favourites"), list) else [],
            "recentlyUsed": profile["data"].get("recentlyUsed") if isinstance(profile["data"].get("recentlyUsed"), list) else [],
        }
        seeded = await api_profile("POST", {"favourites": ["rams", "quote-builder", "drafts"], "recentlyUsed": ["site-diary", "cis-calculator", "apprentice-manager"]})
        record(seeded["ok"], "Seeded favourites/recentlyUsed for strip checks", f"status={seeded['status']}")

        await goto_library()
        cards = await page.locator('section[data-testid^="library-section"] a[data-testid^="tool-"]').evaluate_all("""els => els.map(a => ({
            tid: a.getAttribute('data-testid'),
            href: a.getAttribute('href'),
            text: (a.innerText || '').split(String.fromCharCode(10))[0].trim(),
            section: a.closest('section')?.getAttribute('data-testid'),
            tag: a.tagName,
            width: a.getBoundingClientRect().width,
            height: a.getBoundingClientRect().height
        }))""")
        by_section = {}
        structural_ok = True
        for c in cards:
            by_section[c["section"]] = by_section.get(c["section"], 0) + 1
            structural_ok = structural_ok and c["tag"] == "A" and c["href"] and c["href"].startswith("/app") and c["width"] > 100 and c["height"] > 30
        record(len(cards) > 0 and structural_ok, "All category tool cards are rendered as full-card anchors", f"count={len(cards)}, sections={by_section}")

        for c in cards:
            await click_card(f'[data-testid="{c["tid"]}"]', f"all-category-card {c['tid']} ({c['text']})", None, "center")

        selected_cards = [
            ('[data-testid="tool-health-safety-rams"]', "RAMS", ["/app/rams", "/app/tool/rams"]),
            ('[data-testid="tool-commercial-quote-builder"]', "Quote Builder", ["/app/tool/quote-builder"]),
            ('[data-testid="tool-site-site-diary"]', "Site Diary", ["/app/tool/site-diary", "/app/site-diary"]),
            ('[data-testid="tool-finance-cis-calculator"]', "CIS Calculator", ["/app/cis-calculator", "/app/tool/cis-calculator"]),
            ('[data-testid="tool-hr-apprentice-manager"]', "Apprentice Manager", ["/app/apprentice-manager", "/app/tool/apprentice-manager"]),
            ('[data-testid="tool-utilities-drafts"]', "Drafts", ["/app/drafts"]),
        ]
        for sel, name, paths in selected_cards:
            for pos in ["icon", "title", "description", "padding", "blank-near-star"]:
                await click_card(sel, name, paths, pos)

        # Favourites and Recently Used strips use the same ToolCard component.
        await click_card('[data-testid="library-fav-rams"]', "Favourites strip RAMS", ["/app/rams", "/app/tool/rams"], "padding")
        await click_card('[data-testid="library-recent-tool-site-diary"]', "Recently Used strip Site Diary", ["/app/tool/site-diary", "/app/site-diary"], "title")

        # Star click should not navigate away and should toggle favourite state.
        await goto_library()
        star = page.locator('[data-testid="tool-commercial-fav-quote-builder"]').first
        await star.wait_for(state="attached", timeout=8000)
        before_label = await star.get_attribute("aria-label")
        await star.click(force=True)
        await page.wait_for_timeout(700)
        after_path = path_of(page.url)
        after_label = await star.get_attribute("aria-label")
        record(after_path == "/app/tools-library" and before_label != after_label, "Star icon toggles without navigation", f"path={after_path}, aria {before_label}->{after_label}")

        # Search flow: filter payment and click result card.
        await goto_library()
        await page.locator('[data-testid="library-search"]').fill("payment")
        await page.wait_for_timeout(300)
        await click_card('[data-testid="tool-commercial-payment-chaser"]', "Search result Payment Chaser", ["/app/payment-chaser", "/app/tool/payment-chaser"], "center", reset_to_library=False)

        # Sidebar top-level regression.
        nav_expectations = {
            "nav-command": "/app",
            "nav-projects": "/app/jobs",
            "nav-business": "/app/business",
            "nav-finance": "/app/finance",
            "nav-compliance": "/app/compliance",
            "nav-tools": "/app/tools-library",
            "nav-photo-vault": "/app/photo-vault",
            "nav-settings": "/app/settings",
        }
        for testid, expected in nav_expectations.items():
            await page.goto(f"{BASE}/app/tools-library", wait_until="domcontentloaded")
            await dismiss_overlays()
            nav = page.locator(f'[data-testid="{testid}"]').first
            await nav.wait_for(state="visible", timeout=8000)
            await nav.click(force=True)
            await page.wait_for_timeout(700)
            actual = path_of(page.url)
            record(actual.rstrip("/") == expected.rstrip("/"), f"Sidebar {testid} navigates", f"=> {actual}")

        error_text = await page.evaluate("""() => {
            const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
            return errorElements.map(el => el.textContent).join(", ");
        }""")
        if error_text:
            print(f"Found error message: {error_text}")
        else:
            print("No error messages found on the page")

        if failures:
            raise AssertionError("; ".join(failures[:10]))
        print(f"SUCCESS: Tools Library clickability verification passed with {len(results)} assertions")
    except Exception as exc:
        print(f"TEST FAILURE: {exc}")
        raise
    finally:
        try:
            await api_profile("POST", {"favourites": original_profile.get("favourites", []), "recentlyUsed": original_profile.get("recentlyUsed", [])})
            print("Restored original favourites/recentlyUsed profile state")
        except Exception as cleanup_exc:
            print(f"Cleanup warning: could not restore profile state: {cleanup_exc}")