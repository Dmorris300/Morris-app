"""Resend email helper. Falls back to mock (logs to console) if RESEND_API_KEY is missing."""
import os
import asyncio
import logging
from pathlib import Path
from dotenv import dotenv_values
import resend

logger = logging.getLogger(__name__)

# Read keys directly from the .env file so import-order doesn't matter
# (server.py imports this module BEFORE calling load_dotenv()).
_DOTENV = dotenv_values(Path(__file__).parent / ".env")


def _cfg(key: str, default: str = "") -> str:
    v = _DOTENV.get(key)
    if v:
        return v
    return os.environ.get(key, default)


RESEND_API_KEY = _cfg("RESEND_API_KEY", "")
SENDER_EMAIL = _cfg("SENDER_EMAIL", "onboarding@resend.dev")
APP_BRAND = _cfg("APP_BRAND_NAME", "Morris")
# All admin notifications (new signup, churn, failed payment) are sent here.
ADMIN_NOTIFICATION_EMAIL = _cfg("ADMIN_NOTIFICATION_EMAIL", "hello@morrisapp.co.uk")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def _wrap(content_html: str, preheader: str = "") -> str:
    return f"""<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#060606;font-family:'DM Sans',Arial,Helvetica,sans-serif;color:#F0EDE8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{preheader}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#060606;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#121212;border:1px solid rgba(232,160,32,0.25);border-radius:12px;overflow:hidden;">
      <tr><td style="background:#060606;padding:20px 28px;border-bottom:3px solid #E8A020;">
        <span style="font-family:'Bebas Neue','Arial Narrow',Arial,sans-serif;letter-spacing:2px;color:#E8A020;font-size:26px;font-weight:bold;">MORRIS</span>
      </td></tr>
      <tr><td style="padding:32px 28px;color:#F0EDE8;font-size:15px;line-height:1.6;">
        {content_html}
      </td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid rgba(240,237,232,0.08);font-size:11px;color:#706D66;">
        Morris Construction Tech Ltd &nbsp;&middot;&nbsp; ICO C1923529 &nbsp;&middot;&nbsp; morrisapp.co.uk<br/>
        Built by a tradesman. For tradesmen.
      </td></tr>
    </table>
  </td></tr>
</table></body></html>"""


async def send_email(to: str, subject: str, html: str, preheader: str = "") -> bool:
    full_html = _wrap(html, preheader)
    if not RESEND_API_KEY:
        logger.info(f"[MOCK EMAIL] To={to} Subject={subject}")
        return False
    try:
        params = {
            "from": f"{APP_BRAND} <{SENDER_EMAIL}>",
            "to": [to],
            "subject": subject,
            "html": full_html,
        }
        await asyncio.to_thread(resend.Emails.send, params)
        return True
    except Exception as e:
        logger.warning(f"Resend send failed for {to}: {e}")
        return False


async def send_email_with_pdf(to: str, subject: str, html: str, pdf_bytes: bytes, filename: str, reply_to: str = "", preheader: str = "") -> bool:
    """Send an email with a single PDF attachment via Resend."""
    full_html = _wrap(html, preheader)
    if not RESEND_API_KEY:
        logger.info(f"[MOCK EMAIL+PDF] To={to} Subject={subject} file={filename} bytes={len(pdf_bytes)}")
        return False
    try:
        params = {
            "from": f"{APP_BRAND} <{SENDER_EMAIL}>",
            "to": [to],
            "subject": subject,
            "html": full_html,
            "attachments": [{
                "filename": filename,
                "content": list(pdf_bytes),  # Resend accepts a byte array
            }],
        }
        if reply_to:
            params["reply_to"] = reply_to
        await asyncio.to_thread(resend.Emails.send, params)
        return True
    except Exception as e:
        logger.warning(f"Resend PDF send failed for {to}: {e}")
        return False


async def send_refund_summary(to: str, sender_name: str, sender_email: str, tax_year: str, pdf_bytes: bytes) -> bool:
    """Email a CIS refund summary PDF to an accountant on behalf of the tradesperson."""
    subject = f"CIS refund summary {tax_year} — {sender_name}".strip()
    html = f"""
    <p style="font-size:18px;color:#F0EDE8;margin:0 0 12px 0;">CIS refund summary for {tax_year}</p>
    <p>{sender_name or 'Your client'} has sent you their CIS refund working from Morris.</p>
    <p>The attached PDF shows every CIS payment logged this tax year, gross labour and materials split out, total deducted, and the six-step refund estimate.</p>
    <p style="color:#A19D94;font-size:13px;">Figures are a guide based on logged payments, personal allowance of £12,570, 20% income tax and 6% Class 4 NI. Not a tax return.</p>
    """
    return await send_email_with_pdf(
        to=to,
        subject=subject,
        html=html,
        pdf_bytes=pdf_bytes,
        filename=f"morris-refund-summary-{tax_year.replace('/', '-')}.pdf",
        reply_to=sender_email,
        preheader=f"CIS refund summary {tax_year}",
    )


async def send_password_reset(to: str, reset_link: str) -> bool:
    return await send_email(
        to,
        "Reset your Morris password",
        f"""
        <p style="font-size:18px;color:#F0EDE8;margin:0 0 12px 0;">Reset your password</p>
        <p>Someone (hopefully you) asked to reset the password on your Morris account.</p>
        <p style="margin:28px 0;text-align:center;">
          <a href="{reset_link}" style="background:#E8A020;color:#060606;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:6px;display:inline-block;">Set a new password</a>
        </p>
        <p style="color:#A19D94;font-size:13px;">If the button doesn't work, paste this link into your browser:<br/><span style="color:#E8A020;word-break:break-all;">{reset_link}</span></p>
        <p style="color:#A19D94;font-size:13px;">This link is valid for 30 minutes and can only be used once.</p>
        <p style="color:#706D66;font-size:13px;">Didn't request this? Ignore this email and your password stays the same.</p>
        """,
        preheader="Reset your Morris password",
    )


async def send_welcome(to: str, name: str = "") -> bool:
    greeting = f"Welcome to Morris{', ' + name if name else ''}."
    return await send_email(
        to,
        "Welcome to Morris",
        f"""
        <p style="font-size:18px;color:#F0EDE8;margin:0 0 12px 0;">{greeting}</p>
        <p>You're in. Your toolbox of 90+ trade-specific tools is ready: variation letters, RAMS, CIS invoices, retention chasers and more.</p>
        <p style="margin:28px 0;text-align:center;">
          <a href="{os.environ.get('APP_URL','https://morrisapp.co.uk')}/app" style="background:#E8A020;color:#060606;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:6px;display:inline-block;">Open Morris</a>
        </p>
        <p style="color:#A19D94;">Start with the Verbal-to-Variation tool: speak a verbal site instruction into your phone and Morris turns it into a formal letter you can send before you leave site.</p>
        """,
        preheader="Your Morris toolbox is ready.",
    )


async def send_subscription_receipt(to: str, plan: str, amount_pence: int) -> bool:
    pounds = f"£{amount_pence/100:.2f}"
    return await send_email(
        to,
        f"Morris subscription confirmed: {plan}",
        f"""
        <p style="font-size:18px;color:#F0EDE8;margin:0 0 12px 0;">You're on Morris {plan}.</p>
        <p>Payment received: <strong style="color:#E8A020;">{pounds}</strong>.</p>
        <p>All tools, unlimited documents, all yours.</p>
        <p style="color:#A19D94;font-size:13px;">Need to update payment details or cancel? Sign in and head to Billing.</p>
        """,
        preheader=f"Morris {plan} active. {pounds} charged.",
    )


# ---------- Admin / owner notifications (Prompt 8) ----------
def _admin_panel(title: str, lines: list, accent: str = "#E8A020") -> str:
    rows = "".join(
        f'<tr><td style="padding:6px 12px;color:#A19D94;font-size:13px;width:38%;">{k}</td>'
        f'<td style="padding:6px 12px;color:#F0EDE8;font-size:13px;font-weight:600;">{v}</td></tr>'
        for k, v in lines
    )
    return f"""
        <p style="font-size:18px;color:{accent};margin:0 0 12px 0;font-weight:700;letter-spacing:1px;text-transform:uppercase;">{title}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a0a0a;border:1px solid rgba(232,160,32,0.18);border-radius:8px;margin-top:12px;">
        {rows}
        </table>
        <p style="margin:24px 0 0 0;color:#706D66;font-size:11px;">Sent automatically by Morris. Do not reply.</p>
    """


async def send_admin_signup(username: str, email: str, phone: str = "") -> bool:
    return await send_email(
        ADMIN_NOTIFICATION_EMAIL,
        f"[Morris] New signup: {username}",
        _admin_panel(
            "New Morris signup",
            [
                ("Username", username),
                ("Email", email or ""),
                ("Phone", phone or "(not provided)"),
                ("When", _now_str()),
            ],
        ),
        preheader=f"New Morris signup: {username}",
    )


async def send_admin_payment_success(username: str, email: str, plan: str, amount_pence: int) -> bool:
    pounds = f"£{amount_pence/100:.2f}"
    return await send_email(
        ADMIN_NOTIFICATION_EMAIL,
        f"[Morris] Payment received: {plan} ({pounds})",
        _admin_panel(
            "Subscription paid",
            [
                ("User", username or "(unknown)"),
                ("Email", email or ""),
                ("Plan", plan),
                ("Amount", pounds),
                ("When", _now_str()),
            ],
        ),
        preheader=f"Morris {plan} active. {pounds} charged.",
    )


async def send_admin_payment_failed(username: str, email: str, plan: str, reason: str = "") -> bool:
    return await send_email(
        ADMIN_NOTIFICATION_EMAIL,
        f"[Morris] Payment FAILED: {username or email}",
        _admin_panel(
            "Payment failed",
            [
                ("User", username or "(unknown)"),
                ("Email", email or ""),
                ("Plan", plan or "(unknown)"),
                ("Reason", reason or "(no reason given)"),
                ("When", _now_str()),
            ],
            accent="#E5635A",
        ),
        preheader=f"Payment failed for {username or email}.",
    )


async def send_admin_churn(username: str, email: str, plan: str, reason: str = "cancelled") -> bool:
    return await send_email(
        ADMIN_NOTIFICATION_EMAIL,
        f"[Morris] Churn alert: {username or email}",
        _admin_panel(
            "Subscription cancelled",
            [
                ("User", username or "(unknown)"),
                ("Email", email or ""),
                ("Plan", plan or "(unknown)"),
                ("Reason", reason),
                ("When", _now_str()),
            ],
            accent="#E5635A",
        ),
        preheader=f"Churn: {username or email} cancelled {plan or ''}.",
    )


def _now_str() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%d %b %Y %H:%M UTC")
