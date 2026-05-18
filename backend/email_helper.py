"""Resend email helper. Falls back to mock (logs to console) if RESEND_API_KEY is missing."""
import os
import asyncio
import logging
import resend

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
APP_BRAND = os.environ.get("APP_BRAND_NAME", "Morris")

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
