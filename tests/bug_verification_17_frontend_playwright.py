# Focused Playwright script used with the browser automation runner for bug verification iteration 17.
# It logs in with the admin test account, then verifies the exact three UI regressions:
# - Toolbox Talk step 5 exposes data-testid="tbt-step-5-photos" and contains AttachMedia.
# - COSHH wizard save-template button is in the header/visible across steps, opens modal, and POSTs 200.
# - COSHH and Toolbox Talk wizards navigate through their full step ranges; Method Statement/RAMS render.

import re


async def run(page):
    try:
        await page.set_viewport_size({"width": 1920, "height": 1080})
        base = "https://prompt-web-4.preview.emergentagent.com"

        print("Logging in via real /api/auth/login to seed localStorage")
        await page.goto(base, wait_until="domcontentloaded")
        login_result = await page.evaluate(
            """async () => {
                const r = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: 'darrenhustle300', password: 'hustle1234'})
                });
                const data = await r.json();
                if (!r.ok) return {ok: false, status: r.status, data};
                localStorage.setItem('morris_token', data.token);
                localStorage.setItem('morris_user', JSON.stringify(data.user));
                localStorage.setItem('morris_onboarding_done_v1', '1');
                localStorage.setItem('morris_cookie_consent', 'accepted');
                return {ok: true, status: r.status, username: data.user.username};
            }"""
        )
        assert login_result["ok"], f"login failed: {login_result}"
        print(f"Login OK: {login_result}")

        # Toolbox Talk Step 5 and 1→8 navigation smoke.
        await page.goto(base + "/app/toolbox-talk", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="toolbox-talk-page"]', timeout=15000)
        print("Toolbox Talk page opened")

        await page.locator('[data-testid="tbt-stepper-5"]').click(force=True)
        await page.wait_for_selector('[data-testid="tbt-step-5-photos"]', timeout=10000)
        step5 = page.locator('[data-testid="tbt-step-5-photos"]')
        attach = step5.locator('[data-testid="tbt-attach-root"]')
        assert await step5.is_visible(), "tbt-step-5-photos is not visible"
        assert await attach.is_visible(), "AttachMedia root not present inside tbt-step-5-photos"
        print("Toolbox Step 5 test id and AttachMedia verified")

        for step in range(1, 9):
            await page.locator(f'[data-testid="tbt-stepper-{step}"]').click(force=True)
            await page.wait_for_timeout(100)
            await page.wait_for_selector(f'[data-testid="tbt-stepper-{step}"]', timeout=5000)
            title_text = await page.locator("h2").first.inner_text()
            assert f"Step {step}" in title_text, f"Toolbox expected step {step}, got heading {title_text!r}"
        print("Toolbox Talk 1→8 navigation smoke passed")

        # COSHH save-template header button/modal/POST and 1→12 navigation smoke.
        await page.goto(base + "/app/coshh", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="coshh-page"]', timeout=15000)
        print("COSHH page opened")
        await page.locator('[data-testid="coshh-new-btn"]').click(force=True)
        await page.wait_for_selector('[data-testid="coshh-wizard"]', timeout=10000)
        await page.wait_for_selector('[data-testid="coshh-save-template-btn"]', timeout=10000)
        assert await page.locator('[data-testid="coshh-save-template-btn"]').is_visible(), "save-template button not visible on step 1"
        print("COSHH save-template button visible on step 1")

        # Step 1 click opens the modal, then close it before filling product name.
        await page.locator('[data-testid="coshh-save-template-btn"]').click(force=True)
        await page.wait_for_selector('[data-testid="coshh-template-modal"]', timeout=5000)
        print("COSHH save-template button opens modal")
        await page.keyboard.press("Escape")
        if await page.locator('[data-testid="coshh-template-modal"]').is_visible():
            await page.locator('[data-testid="coshh-template-modal"] button').first.click(force=True)
        await page.wait_for_timeout(200)

        await page.locator('[data-testid="coshh-step-2"]').click(force=True)
        await page.wait_for_selector('[data-testid="coshh-productName"]', timeout=5000)
        product_name = "BUG17 UI Template Product"
        template_name = "BUG17 UI Template"
        await page.locator('[data-testid="coshh-productName"]').fill(product_name)
        await page.locator('[data-testid="coshh-manufacturer"]').fill("QA Manufacturer")
        assert await page.locator('[data-testid="coshh-save-template-btn"]').is_visible(), "save-template button not visible on step 2"

        async with page.expect_response(lambda resp: "/api/coshh/templates" in resp.url and resp.request.method == "POST") as resp_info:
            await page.locator('[data-testid="coshh-save-template-btn"]').click(force=True)
            await page.wait_for_selector('[data-testid="coshh-template-modal"]', timeout=5000)
            await page.locator('[data-testid="coshh-template-name"]').fill(template_name)
            await page.locator('[data-testid="coshh-template-save"]').click(force=True)
        tpl_response = await resp_info.value
        assert tpl_response.status == 200, f"COSHH template POST returned {tpl_response.status}"
        tpl_body = await tpl_response.json()
        print(f"COSHH template POST 200 verified, id={tpl_body.get('id')}")
        await page.wait_for_timeout(500)

        # Navigate 1→12 via the wizard stepper and assert header button stays visible on every step.
        missing_steps = []
        for step in range(1, 13):
            await page.locator(f'[data-testid="coshh-step-{step}"]').click(force=True)
            await page.wait_for_timeout(100)
            wizard_text = await page.locator('[data-testid="coshh-wizard"]').inner_text()
            assert f"Step {step} of 12" in wizard_text, f"COSHH expected step text Step {step} of 12"
            if not await page.locator('[data-testid="coshh-save-template-btn"]').is_visible():
                missing_steps.append(step)
        assert not missing_steps, f"COSHH save-template button missing on steps {missing_steps}"
        print("COSHH 1→12 navigation smoke passed and save-template button visible on checked steps")

        # Cleanup template created by this test, if response body included id.
        if tpl_body.get("id"):
            cleanup = await page.evaluate(
                """async (id) => {
                    const token = localStorage.getItem('morris_token');
                    const r = await fetch(`/api/coshh/templates/${id}`, {method: 'DELETE', headers: {Authorization: `Bearer ${token}`}});
                    return {status: r.status, ok: r.ok};
                }""",
                tpl_body.get("id"),
            )
            print(f"Template cleanup: {cleanup}")

        # Regression page renders.
        for route, expected in [("/app/method-statement", "Method Statement"), ("/app/rams", "RAMS")]:
            await page.goto(base + route, wait_until="domcontentloaded")
            await page.wait_for_timeout(1000)
            text = await page.locator("body").inner_text()
            assert expected in text, f"{route} did not render expected text {expected!r}"
            print(f"Regression route {route} rendered")

        # Get error messages using specific selectors
        error_text = await page.evaluate("""() => {
        const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
        return errorElements.map(el => el.textContent).join(", ");
        }""")
        if error_text:
            print(f"Found error message: {error_text}")
        else:
            print("No error messages found on the page")

        print("FRONTEND BUG VERIFICATION PASSED")
    except Exception as e:
        print(f"FRONTEND BUG VERIFICATION FAILED: {e}")
        raise