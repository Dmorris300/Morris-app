"""Stripe billing: plans, checkout, status polling, webhook + tier enforcement."""
import os
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel
from typing import Optional

from dotenv import dotenv_values
import stripe as stripe_sdk
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionResponse, CheckoutSessionRequest, CheckoutStatusResponse,
)

logger = logging.getLogger(__name__)

# Stripe keys live in /app/backend/.env. We read them directly so the .env values
# take precedence over any STRIPE_API_KEY=sk_test_emergent placeholder that the
# container's shell environment may have pre-set.
_DOTENV = dotenv_values(Path(__file__).parent / ".env")

def _cfg(key: str, default: str = "") -> str:
    """Prefer the .env file value, fall back to os.environ."""
    v = _DOTENV.get(key)
    if v:
        return v
    return os.environ.get(key, default)

STRIPE_API_KEY = _cfg("STRIPE_API_KEY", "")
# A "real" Stripe key is any sk_test_... that isn't the placeholder used in dev,
# or any sk_live_... key.
STRIPE_LIVE = (STRIPE_API_KEY.startswith("sk_test_") and STRIPE_API_KEY != "sk_test_emergent") or STRIPE_API_KEY.startswith("sk_live_")

# Server-defined plans — never trust the frontend on price.
# Each plan has a stripePriceId for a recurring subscription product.
PLANS = {
    "solo":       {"name": "Solo",       "price": 12.99,  "currency": "gbp", "stripePriceId": _cfg("STRIPE_PRICE_SOLO", "")},
    "pro":        {"name": "Pro",        "price": 24.99,  "currency": "gbp", "stripePriceId": _cfg("STRIPE_PRICE_PRO", "")},
    "business":   {"name": "Business",   "price": 59.99,  "currency": "gbp", "stripePriceId": _cfg("STRIPE_PRICE_BUSINESS", "")},
    "enterprise": {"name": "Enterprise", "price": 199.99, "currency": "gbp", "stripePriceId": _cfg("STRIPE_PRICE_ENTERPRISE", "")},
}

TRIAL_DAYS = 3

# Free tier limits per calendar month
FREE_TOOL_LIMIT = 3
FREE_DOC_LIMIT = 5


# ---------- Models ----------
class CheckoutReq(BaseModel):
    planId: str  # "solo" | "pro" | "business"
    originUrl: str  # frontend window.location.origin


class TrialReq(BaseModel):
    planId: str = "solo"  # which tier the trial unlocks (Solo by default)


# ---------- Helpers ----------
def current_month_key() -> str:
    n = datetime.now(timezone.utc)
    return f"{n.year}-{n.month:02d}"


def is_unlimited_admin(user: dict) -> bool:
    """Special accounts that bypass every plan limit, tier gate and free-tier cap."""
    if not user:
        return False
    if user.get("isAdmin") is True:
        return True
    if (user.get("username") or "").lower() == "darrenhustle300":
        return True
    return False


def effective_plan(user: dict) -> str:
    """Returns 'free' | 'solo' | 'pro' | 'business' | 'trial' | 'unlimited'."""
    if is_unlimited_admin(user):
        return "unlimited"
    plan = user.get("plan") or "free"
    expires = user.get("planExpiresAt")
    if plan == "free":
        return "free"
    if not expires:
        return "free"
    if isinstance(expires, str):
        try:
            expires = datetime.fromisoformat(expires)
        except Exception:
            return "free"
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        return "free"
    return plan


async def reset_usage_if_new_month(db, user: dict):
    key = current_month_key()
    if user.get("usageMonth") != key:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"usageMonth": key, "usageDocs": 0, "usageTools": []}},
        )


async def check_can_generate(db, user: dict, tool_id: str):
    """Raises HTTPException 402 if user has hit free-tier limits. Returns nothing on pass."""
    if is_unlimited_admin(user):
        return  # darrenhustle300 / admin: unlimited, no metering
    plan = effective_plan(user)
    if plan != "free":
        return  # all paid/trial users: unlimited
    await reset_usage_if_new_month(db, user)
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    used_tools = fresh.get("usageTools", []) or []
    used_docs = fresh.get("usageDocs", 0) or 0
    # If this tool is already used this month, it doesn't count as a new tool
    new_tool = tool_id not in used_tools
    if new_tool and len(used_tools) >= FREE_TOOL_LIMIT:
        raise HTTPException(402, f"Free plan is limited to {FREE_TOOL_LIMIT} different tools per month. Upgrade to unlock all tools.")
    if used_docs >= FREE_DOC_LIMIT:
        raise HTTPException(402, f"Free plan is limited to {FREE_DOC_LIMIT} documents per month. Upgrade for unlimited documents.")


async def record_usage(db, user: dict, tool_id: str):
    if is_unlimited_admin(user):
        return  # admin: no usage tracking
    plan = effective_plan(user)
    if plan != "free":
        return  # paid plans don't track usage limits
    await reset_usage_if_new_month(db, user)
    used = (await db.users.find_one({"id": user["id"]}, {"_id": 0, "usageTools": 1})).get("usageTools", []) or []
    update = {"$inc": {"usageDocs": 1}}
    if tool_id not in used:
        update["$addToSet"] = {"usageTools": tool_id}
    await db.users.update_one({"id": user["id"]}, update)


def build_router(db, get_user, send_subscription_receipt):
    router = APIRouter(prefix="/api/billing")

    # ---------- Public: list plans ----------
    @router.get("/plans")
    async def list_plans():
        return {"plans": PLANS, "trialDays": TRIAL_DAYS, "free": {"toolLimit": FREE_TOOL_LIMIT, "docLimit": FREE_DOC_LIMIT}}

    # ---------- Auth: current status ----------
    @router.get("/status")
    async def my_status(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        await reset_usage_if_new_month(db, user)
        fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0, "token": 0})
        plan = effective_plan(fresh)
        expires = fresh.get("planExpiresAt")
        if isinstance(expires, datetime):
            expires = expires.isoformat()
        return {
            "plan": plan,
            "rawPlan": fresh.get("plan") or "free",
            "trialPlanTarget": fresh.get("trialPlanTarget"),
            "planExpiresAt": expires,
            "trialUsed": fresh.get("trialUsed", False),
            "usageMonth": fresh.get("usageMonth"),
            "usageDocs": fresh.get("usageDocs", 0) or 0,
            "usageTools": fresh.get("usageTools", []) or [],
            "freeToolLimit": FREE_TOOL_LIMIT,
            "freeDocLimit": FREE_DOC_LIMIT,
            "isUnlimited": is_unlimited_admin(fresh),
        }

    # ---------- Auth: start free trial ----------
    @router.post("/start-trial")
    async def start_trial(req: TrialReq, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        if fresh.get("trialUsed"):
            raise HTTPException(400, "You've already used your free trial. Subscribe to keep all tools unlocked.")
        if effective_plan(fresh) != "free":
            raise HTTPException(400, "You already have an active plan.")
        if req.planId not in PLANS:
            raise HTTPException(400, "Unknown plan")
        expires = datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"plan": "trial", "trialPlanTarget": req.planId, "planExpiresAt": expires, "trialUsed": True, "trialStartedAt": datetime.now(timezone.utc)}},
        )
        return {"ok": True, "plan": "trial", "expiresAt": expires.isoformat(), "days": TRIAL_DAYS}

    # ---------- Auth: create checkout ----------
    @router.post("/checkout")
    async def create_checkout(req: CheckoutReq, request: Request, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if is_unlimited_admin(user):
            raise HTTPException(400, "Your account already has unlimited access. No subscription required.")
        if req.planId not in PLANS:
            raise HTTPException(400, "Unknown plan")
        plan = PLANS[req.planId]

        origin = req.originUrl.rstrip("/")

        # MOCK MODE — no real Stripe key configured. Generate a fake session and let the frontend simulate payment.
        if not STRIPE_LIVE:
            session_id = f"mock_{uuid.uuid4().hex}"
            await db.payment_transactions.insert_one({
                "id": str(uuid.uuid4()),
                "sessionId": session_id,
                "userId": user["id"],
                "username": user.get("username"),
                "email": user.get("email"),
                "planId": req.planId,
                "amount": float(plan["price"]),
                "currency": plan["currency"],
                "status": "initiated",
                "paymentStatus": "pending",
                "mock": True,
                "createdAt": datetime.now(timezone.utc),
            })
            mock_url = f"{origin}/app/billing/mock-checkout?session_id={session_id}&plan={req.planId}"
            return {"url": mock_url, "sessionId": session_id, "mock": True}

        # REAL Stripe path — use the official stripe SDK directly for a recurring subscription.
        # (The emergentintegrations helper hard-codes mode='payment', so we bypass it for checkout creation.
        # We still use it for status polling and webhook signature verification below.)
        success_url = f"{origin}/app/billing?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{origin}/app/billing?cancelled=1"

        if not plan.get("stripePriceId"):
            raise HTTPException(500, f"Stripe price ID not configured for plan '{req.planId}'. Set STRIPE_PRICE_{req.planId.upper()} in backend .env.")

        stripe_sdk.api_key = STRIPE_API_KEY
        try:
            session_kwargs = {
                "mode": "subscription",
                "line_items": [{"price": plan["stripePriceId"], "quantity": 1}],
                "success_url": success_url,
                "cancel_url": cancel_url,
                "metadata": {
                    "userId": user["id"],
                    "username": user.get("username", ""),
                    "planId": req.planId,
                    "planName": plan["name"],
                },
                # Pass the metadata down to the resulting Subscription so webhook handlers can read it
                "subscription_data": {
                    "metadata": {
                        "userId": user["id"],
                        "username": user.get("username", ""),
                        "planId": req.planId,
                    },
                },
            }
            # Re-use the same Stripe customer for this user if we have one;
            # in subscription mode Stripe auto-creates a customer when `customer_email` is supplied.
            if user.get("stripeCustomerId"):
                session_kwargs["customer"] = user["stripeCustomerId"]
            elif user.get("email"):
                session_kwargs["customer_email"] = user["email"]

            session_obj = stripe_sdk.checkout.Session.create(**session_kwargs)
        except stripe_sdk.error.StripeError as e:
            logger.exception("Stripe checkout failed")
            raise HTTPException(500, f"Stripe error: {e.user_message or str(e)}")
        except Exception as e:
            logger.exception("Stripe checkout failed")
            raise HTTPException(500, f"Stripe error: {e}")

        await db.payment_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "sessionId": session_obj.id,
            "userId": user["id"],
            "username": user.get("username"),
            "email": user.get("email"),
            "planId": req.planId,
            "amount": float(plan["price"]),
            "currency": plan["currency"],
            "stripePriceId": plan.get("stripePriceId"),
            "status": "initiated",
            "paymentStatus": "pending",
            "mock": False,
            "createdAt": datetime.now(timezone.utc),
        })
        return {"url": session_obj.url, "sessionId": session_obj.id, "mock": False}

    # ---------- MOCK ONLY: complete a fake checkout (no real Stripe configured) ----------
    @router.post("/mock-complete")
    async def mock_complete(session_id: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if STRIPE_LIVE:
            raise HTTPException(400, "Real Stripe is configured — use the real checkout flow.")
        record = await db.payment_transactions.find_one({"sessionId": session_id}, {"_id": 0})
        if not record:
            raise HTTPException(404, "Session not found")
        if record["userId"] != user["id"]:
            raise HTTPException(403, "Not your session")
        if record.get("status") == "complete":
            return {"ok": True, "alreadyProcessed": True}
        plan_id = record["planId"]
        expires = datetime.now(timezone.utc) + timedelta(days=30)
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"plan": plan_id, "planExpiresAt": expires, "lastPaymentAt": datetime.now(timezone.utc)}},
        )
        await db.payment_transactions.update_one(
            {"sessionId": session_id},
            {"$set": {"status": "complete", "paymentStatus": "paid", "updatedAt": datetime.now(timezone.utc)}},
        )
        if user.get("email") and plan_id in PLANS:
            try:
                await send_subscription_receipt(user["email"], PLANS[plan_id]["name"], int(record.get("amount", 0) * 100))
            except Exception:
                pass
        return {"ok": True, "planId": plan_id, "expiresAt": expires.isoformat()}

    # ---------- Auth: poll status after redirect ----------
    @router.get("/status/{session_id}")
    async def checkout_status(session_id: str, request: Request, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        record = await db.payment_transactions.find_one({"sessionId": session_id}, {"_id": 0})
        if not record:
            raise HTTPException(404, "Session not found")
        if record["userId"] != user["id"]:
            raise HTTPException(403, "Not your session")

        # MOCK session — short-circuit, no Stripe API call
        if session_id.startswith("mock_") or record.get("mock"):
            return {
                "status": record.get("status", "initiated"),
                "paymentStatus": record.get("paymentStatus", "pending"),
                "amountTotal": int(record.get("amount", 0) * 100),
                "currency": record.get("currency", "gbp"),
                "metadata": {"planId": record.get("planId"), "mock": True},
            }

        host_url = str(request.base_url).rstrip("/")
        stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{host_url}/api/webhook/stripe")
        try:
            status: CheckoutStatusResponse = await stripe.get_checkout_status(session_id)
        except Exception as e:
            logger.exception("Stripe status check failed")
            raise HTTPException(500, f"Stripe status error: {e}")

        already_processed = record.get("status") == "complete"
        await db.payment_transactions.update_one(
            {"sessionId": session_id},
            {"$set": {"status": status.status, "paymentStatus": status.payment_status, "updatedAt": datetime.now(timezone.utc)}},
        )

        # Idempotent: only activate plan once
        if status.payment_status == "paid" and not already_processed:
            plan_id = record.get("planId")
            expires = datetime.now(timezone.utc) + timedelta(days=30)
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"plan": plan_id, "planExpiresAt": expires, "lastPaymentAt": datetime.now(timezone.utc)}},
            )
            # Fire-and-forget receipt
            if user.get("email"):
                try:
                    await send_subscription_receipt(user["email"], PLANS[plan_id]["name"], int(record.get("amount", 0) * 100))
                except Exception as e:
                    logger.warning(f"Receipt email failed: {e}")

        return {
            "status": status.status,
            "paymentStatus": status.payment_status,
            "amountTotal": status.amount_total,
            "currency": status.currency,
            "metadata": status.metadata,
        }

    return router


def build_webhook_router(db, send_subscription_receipt):
    router = APIRouter()

    @router.post("/api/webhook/stripe")
    async def stripe_webhook(request: Request):
        body = await request.body()
        sig = request.headers.get("Stripe-Signature", "")
        host_url = str(request.base_url).rstrip("/")
        stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{host_url}/api/webhook/stripe")
        try:
            event = await stripe.handle_webhook(body, sig)
        except Exception as e:
            logger.warning(f"Webhook verify failed: {e}")
            raise HTTPException(400, "Invalid webhook")
        # Idempotent: if checkout completed, activate plan
        if event.event_type and "checkout" in event.event_type and event.payment_status == "paid":
            session_id = event.session_id
            record = await db.payment_transactions.find_one({"sessionId": session_id}, {"_id": 0})
            if record and record.get("status") != "complete":
                plan_id = record.get("planId")
                user_id = record.get("userId")
                expires = datetime.now(timezone.utc) + timedelta(days=30)
                await db.users.update_one(
                    {"id": user_id},
                    {"$set": {"plan": plan_id, "planExpiresAt": expires, "lastPaymentAt": datetime.now(timezone.utc)}},
                )
                await db.payment_transactions.update_one(
                    {"sessionId": session_id},
                    {"$set": {"status": "complete", "paymentStatus": "paid", "updatedAt": datetime.now(timezone.utc)}},
                )
                if record.get("email") and plan_id in PLANS:
                    try:
                        await send_subscription_receipt(record["email"], PLANS[plan_id]["name"], int(record.get("amount", 0) * 100))
                    except Exception:
                        pass
        return {"ok": True}

    return router
