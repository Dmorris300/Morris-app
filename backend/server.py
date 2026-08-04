from fastapi import FastAPI, APIRouter, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import secrets
import uuid
import bcrypt
import base64
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage
from email_helper import (
    send_password_reset, send_welcome, send_subscription_receipt,
    send_admin_signup, send_refund_summary,
)
from billing import build_router as build_billing_router, build_webhook_router, check_can_generate, record_usage, effective_plan
from photo_vault import build_router as build_photo_vault_router, try_init_storage as try_init_photo_vault_storage
from command_centre import build_router as build_command_centre_router
from project_workspace import build_router as build_project_workspace_router, emit_event as emit_project_event
from compliance import build_router as build_compliance_router
from method_statement import build_router as build_method_statement_router
from toolbox_talks import build_router as build_toolbox_talks_router
from coshh import build_router as build_coshh_router
from site_diary import build_router as build_site_diary_router
from incident_report import build_router as build_incident_report_router
from risk_assessment import build_router as build_risk_assessment_router
from quote_builder import build_router as build_quote_builder_router
from variation_orders import build_router as build_variation_orders_router
from applications_for_payment import build_router as build_afp_router
from invoice_builder import build_router as build_invoice_router
from purchase_orders import build_router as build_purchase_orders_router
from contracts import build_router as build_contracts_router
from snagging import build_router as build_snagging_router
from global_search import build_router as build_search_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="Morris API")
api_router = APIRouter(prefix="/api")

# ---------- Models ----------
class SignupReq(BaseModel):
    username: str
    email: EmailStr
    password: str
    phone: str

class VerifyOtpReq(BaseModel):
    username: str
    otp: str

class LoginReq(BaseModel):
    username: str  # accepts username OR email
    password: str

class ForgotPasswordReq(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

class ResetPasswordReq(BaseModel):
    token: Optional[str] = None
    phone: Optional[str] = None
    code: Optional[str] = None
    newPassword: str

class ProfileUpdate(BaseModel):
    trade: Optional[str] = None
    companyName: Optional[str] = None
    fullName: Optional[str] = None
    address: Optional[str] = None
    contactNumber: Optional[str] = None
    utr: Optional[str] = None
    vatNumber: Optional[str] = None
    vatRegistered: Optional[bool] = None
    cisStatus: Optional[str] = None
    insuranceExpiry: Optional[str] = None
    cscsExpiry: Optional[str] = None
    vehicleReg: Optional[str] = None
    bankDetails: Optional[str] = None
    signature: Optional[str] = None         # base64 PNG data URL (e.g. "data:image/png;base64,...")
    signatureRole: Optional[str] = None     # e.g. "Director", "Site Manager"
    cscsCardFront: Optional[str] = None     # base64 image data URL
    cscsCardBack: Optional[str] = None      # base64 image data URL
    companyLogo: Optional[str] = None       # white-label logo (Enterprise only)
    nationalInsuranceNumber: Optional[str] = None
    companyRegNumber: Optional[str] = None
    # Bank details (split into 3 fields). shareBankDetails controls whether
    # they appear on the shared profile PDF (always appear on relevant docs).
    sortCode: Optional[str] = None
    accountNumber: Optional[str] = None
    bankName: Optional[str] = None
    shareBankDetails: Optional[bool] = None
    email: Optional[EmailStr] = None
    favourites: Optional[List[str]] = None
    recentlyUsed: Optional[List[str]] = None
    notificationPrefs: Optional[dict] = None

class GenerateReq(BaseModel):
    toolId: str
    toolName: str
    promptTemplate: str
    userInputs: Dict[str, Any] = Field(default_factory=dict)
    trade: Optional[str] = None
    companyName: Optional[str] = None
    fullName: Optional[str] = None
    jobId: Optional[str] = None  # link to a Job in the user's Job Tracker

class DocumentSave(BaseModel):
    title: str
    toolId: str
    content: str
    refNumber: Optional[str] = None
    jobId: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class CISPayment(BaseModel):
    """A CIS payment received from a contractor.
    
    Frontend sends the new structured fields (grossLabour, materials, cisRate).
    The server computes deduction, gross, and net so the user can never type
    those manually.
    """
    date: str
    contractor: str
    grossLabour: Optional[float] = None
    materials: Optional[float] = 0.0
    cisRate: Optional[float] = 0.20  # 0.20 (registered) or 0.30 (unregistered)
    # Legacy fields kept so older records still deserialise cleanly.
    gross: Optional[float] = None
    deduction: Optional[float] = None
    net: Optional[float] = None
    notes: Optional[str] = ""


class DraftSave(BaseModel):
    """A user-initiated mid-form save. Validation is intentionally permissive —
    drafts may carry partial / blank data. Each draft is per-user + per-tool;
    a single user can keep many drafts of the same tool (e.g. one per job).
    """
    toolId: str
    toolName: str
    title: Optional[str] = None       # auto-derived if blank
    data: Dict[str, Any] = Field(default_factory=dict)
    # When updating an existing draft. None = create a new one.
    draftId: Optional[str] = None


class ExpenseEntry(BaseModel):
    """An allowable business expense logged by the user."""
    date: str
    category: str  # tools | fuel | ppe | training | insurance | accountant | phone | marketing | materials | mileage | other
    description: Optional[str] = ""
    amount: float
    notes: Optional[str] = ""

# ---------- Jobs ----------
JOB_STATUSES = ["planning", "active", "on_hold", "awaiting_payment", "invoiced", "paid", "completed", "disputed", "archived"]

class JobCreate(BaseModel):
    clientName: str
    projectName: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = ""
    siteManager: Optional[str] = None
    clientContact: Optional[str] = None
    contractValue: Optional[float] = 0.0
    poNumber: Optional[str] = None
    startDate: Optional[str] = None
    expectedCompletion: Optional[str] = None
    notes: Optional[str] = ""

class JobUpdate(BaseModel):
    clientName: Optional[str] = None
    projectName: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    siteManager: Optional[str] = None
    clientContact: Optional[str] = None
    contractValue: Optional[float] = None
    poNumber: Optional[str] = None
    startDate: Optional[str] = None
    expectedCompletion: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    disputeNote: Optional[str] = None
    paidDate: Optional[str] = None
    pinned: Optional[bool] = None

# ---------- Helpers ----------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def check_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

async def get_user(token: Optional[str]) -> dict:
    if not token:
        raise HTTPException(401, "Missing token")
    user = await db.users.find_one({"token": token}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(401, "Invalid token")
    # Compute admin / unlimited flag for the response so the UI can surface it
    if (user.get("username") or "").lower() == "darrenhustle300" or user.get("isAdmin"):
        user["isAdmin"] = True
        user["isUnlimited"] = True
    # Bump last-active timestamp (used by the Team Management dashboard)
    try:
        await db.users.update_one({"id": user["id"]}, {"$set": {"lastActiveAt": datetime.now(timezone.utc)}})
    except Exception:
        pass
    return user


# ---------- Unique Document Reference Numbers ----------
# Format: {TYPE}-{INITIALS}-{YYMMDD}-{NNN}
# e.g. VAR-DM-260525-001
_TOOL_ABBR = {
    "variation-letter": "VAR", "verbal-to-variation": "VAR",
    "rams": "RAMS", "site-diary": "SD", "quote-builder": "QUO", "cis-invoice": "INV",
    "delay-notice": "DN", "handover-certificate": "HC", "subcontract-letter": "SUB",
    "complaint-letter": "COMP", "timesheet": "TS", "daywork-sheet": "DW",
    "application-for-payment": "AFP", "retention-chaser": "RC", "final-account": "FA",
    "contra-charge-dispute": "CCD", "eot-claim": "EOT", "lds-dispute": "LDD",
    "progress-report": "PR", "novation-letter": "NOV", "bad-debt-letter": "BDL",
    "photo-to-document": "PTD", "payment-chaser": "PC", "self-assessment-prep": "SAP",
    "subbie-payment-cert": "SPC", "hs-policy": "HSP", "rams-library": "RAMS",
    "toolbox-talk": "TBT", "asbestos-record": "ASB", "incident-report": "IR",
    "site-access-permit": "SAP", "meeting-notes": "MN", "purchase-order": "PO",
    "snagging-list": "SNG", "weather-log": "WX", "delivery-record": "DR",
    "coshh": "COSHH", "noise-assessment": "NA", "manual-handling": "MH",
    "working-at-height-rescue": "WAHR", "new-starter-pack": "NSP", "hire-agreement": "HA",
    "tender-letter": "TL", "scope-of-works": "SOW", "price-work-variation": "PWV",
    "standing-time": "ST", "price-work-profit": "PWP",
}


def _ref_abbr(tool_id: str) -> str:
    if tool_id in _TOOL_ABBR:
        return _TOOL_ABBR[tool_id]
    # Fallback: first letters of each hyphen-separated segment, uppercase
    parts = [p for p in (tool_id or "").split("-") if p]
    abbr = "".join(p[0] for p in parts).upper() or "DOC"
    return abbr[:6]


def _ref_initials(user: dict) -> str:
    name = (user.get("fullName") or user.get("username") or "User").strip()
    parts = [p for p in name.split() if p]
    if len(parts) >= 2:
        return (parts[0][0] + parts[-1][0]).upper()
    return (parts[0][:2] if parts else "MM").upper()


async def next_ref_number(user: dict, tool_id: str) -> str:
    """Increment the user's per-tool counter and return a formatted ref number."""
    today = datetime.now(timezone.utc)
    ymd = today.strftime("%y%m%d")
    year_full = today.strftime("%Y")
    counter_key = f"docCounters.{tool_id}.{ymd}"
    res = await db.users.find_one_and_update(
        {"id": user["id"]},
        {"$inc": {counter_key: 1}},
        return_document=True,
    )
    seq = (((res or {}).get("docCounters") or {}).get(tool_id) or {}).get(ymd, 1)
    # Per-tool custom ref formats (spec: tools 3, 4, 5, 7, 9, 10, 11)
    custom = {
        "quote-builder":         f"QB-{year_full}-{seq:03d}",
        "price-work-quote":      f"QB-{year_full}-{seq:03d}",
        "variation-letter":      f"VO-{seq:03d}",
        "cis-invoice":           f"INV-{year_full}-{seq:03d}",
        "snagging-list":         f"SNG-{seq:03d}",
        "progress-report":       f"PR-{seq:03d}",
        "eot-claim":             f"EOT-{seq:03d}",
        "handover-certificate":  f"PCC-{seq:03d}",
    }
    if tool_id in custom:
        return custom[tool_id]
    return f"{_ref_abbr(tool_id)}-{_ref_initials(user)}-{ymd}-{seq:03d}"


# Tools that should auto-populate the user's bank details under a clearly
# labelled Payment Details section near the bottom of the generated document.
# This is a strict allowlist — bank details NEVER appear on any other tool.
BANK_DETAILS_TOOLS = {
    "cis-invoice",
    "application-for-payment",
    "daywork-sheet",
    "retention-chaser",
    "subbie-payment-cert",
    "final-account",
    "bad-debt-letter",
    "payment-chaser",
    "quote-builder",
    "price-work-quote",
}


def _bank_details_block(user: dict) -> str:
    """Returns the labelled Payment Details block for the system prompt, or '' if nothing is set."""
    sort_code = (user.get("sortCode") or "").strip()
    account_number = (user.get("accountNumber") or "").strip()
    bank_name = (user.get("bankName") or "").strip()
    if not (sort_code or account_number or bank_name):
        return ""
    lines = ["PAYMENT DETAILS (include these EXACTLY as written, in a clearly labelled 'PAYMENT DETAILS' section near the bottom of the document):"]
    if bank_name:
        lines.append(f"Bank: {bank_name}")
    if user.get("fullName") or user.get("companyName"):
        lines.append(f"Account name: {user.get('companyName') or user.get('fullName')}")
    if sort_code:
        lines.append(f"Sort code: {sort_code}")
    if account_number:
        lines.append(f"Account number: {account_number}")
    return "\n".join(lines)



# Single sign-off: contractor only. Dual sign-off: contractor AND client/receiving party.
SINGLE_SIGNOFF_TOOLS = {
    "site-diary", "coshh", "noise-assessment", "manual-handling",
    "working-at-height-rescue", "toolbox-talk", "asbestos-record", "hs-policy",
    "risk-register", "timesheet", "daywork-sheet", "delay-notice",
    "progress-report", "incident-report", "incident-log", "photo-evidence-log",
    "verbal-instruction-recorder", "measurement-record", "weather-log",
    "prestart-meeting", "meeting-notes", "site-access-permit", "delivery-record",
    "rams", "rams-library", "variation-instruction-log", "multiuser-site-diary",
    "labour-allocation", "tool-register", "procurement-schedule",
    "reminders", "dispute-timeline", "contract-review",
}
DUAL_SIGNOFF_TOOLS = {
    "quote-builder", "variation-letter", "verbal-to-variation",
    "cis-invoice", "handover-certificate", "subcontract-letter",
    "complaint-letter", "application-for-payment", "retention-chaser",
    "final-account", "contra-charge-dispute", "eot-claim", "lds-dispute",
    "novation-letter", "bad-debt-letter", "snagging-list", "purchase-order",
    "subbie-payment-cert", "hire-agreement", "tender-letter",
    "scope-of-works", "price-work-quote", "rate-increase-letter",
    "hmrc-correspondence", "reference-letter",
    # Photo-to-Document inherits dual (most converted docs are client-facing)
    "photo-to-document",
    # Delay Notice + Standing Time both need counter-signature from the main contractor
    "delay-notice", "standing-time-calculator",
}


def _signoff_instructions(tool_id: str, profile: dict, has_signature: bool) -> str:
    """Returns the section of the system prompt that tells Claude exactly what
    sign-off block(s) to append. Applied globally — never per-tool."""
    name = profile.get("fullName") or ""
    role = profile.get("signatureRole") or ""
    company = profile.get("companyName") or ""
    now_str = datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M")
    sig_line = ("Signature: (signed electronically. saved signature on file)" if has_signature
                else "Signature: Add your signature in profile settings to complete this document.")

    contractor_block = (
        "CONTRACTOR SIGN-OFF\n"
        f"Name: {name}\n"
        f"Role: {role or '(role not set in profile)'}\n"
        f"Company: {company}\n"
        f"Date and time: {now_str}\n"
        f"{sig_line}\n"
    )

    if tool_id in DUAL_SIGNOFF_TOOLS:
        # The client signature box marker [SIGN HERE] is rendered by the PDF
        # generator as an actual draw-able signature rectangle. The follow-on
        # caption is printed verbatim below the box.
        client_block = (
            "CLIENT SIGN-OFF (to be completed by the recipient)\n"
            "Name: ____________________________\n"
            "Role: ____________________________\n"
            "Company: ____________________________\n"
            "Date and time: ____________________________\n"
            "Signature: [SIGN HERE]\n"
            "Please sign and return a copy for your records.\n"
        )
        return (
            "MANDATORY SIGN-OFF BLOCKS: Every document MUST end with the following two sign-off blocks, "
            "in this exact format, on their own lines, separated by a single blank line. "
            "Use the contractor values exactly as provided — the contractor's saved electronic "
            "signature is auto-applied on the PDF directly beside the 'Signature:' line. "
            "For the CLIENT block, output the lines EXACTLY as shown including the literal text "
            "'Signature: [SIGN HERE]' and the follow-on caption 'Please sign and return a copy for "
            "your records.' The Morris PDF generator replaces '[SIGN HERE]' with a drawn signature "
            "box for the recipient to sign inside. Do not substitute, omit, or paraphrase this marker.\n\n"
            + contractor_block + "\n" + client_block
        )

    # Default to single sign-off for any tool not in either set
    return (
        "MANDATORY SIGN-OFF BLOCK: Every document MUST end with the following single contractor sign-off block, "
        "in this exact format, on its own lines. Use the contractor values exactly as provided. "
        "Do not add a client sign-off block.\n\n"
        + contractor_block
    )


# ---------- Auth ----------
@api_router.post("/auth/signup")
async def signup(req: SignupReq):
    email_lower = req.email.lower()
    if await db.users.find_one({"username": req.username.lower()}, {"_id": 0}):
        raise HTTPException(400, "Username already exists")
    if await db.users.find_one({"email": email_lower}, {"_id": 0}):
        raise HTTPException(400, "Email already registered")
    otp = f"{secrets.randbelow(900000) + 100000}"
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "username": req.username.lower(),
        "email": email_lower,
        "password": hash_pw(req.password),
        "phone": req.phone,
        "verified": False,
        "otp": otp,
        "trade": None,
        "companyName": None,
        "fullName": None,
        "address": None,
        "utr": None,
        "vatNumber": None,
        "cisStatus": "Net 20%",
        "favourites": [],
        "recentlyUsed": [],
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    # Fire-and-forget welcome + admin notification (won't block signup if Resend is unreachable)
    try:
        await send_welcome(email_lower, req.username)
    except Exception as e:
        logger.warning(f"Welcome email failed: {e}")
    try:
        await send_admin_signup(req.username, email_lower, req.phone)
    except Exception as e:
        logger.warning(f"Admin signup notification failed: {e}")
    return {"ok": True, "userId": user_id, "otp": otp, "message": "OTP sent. (Demo: shown here.)"}

@api_router.post("/auth/verify-otp")
async def verify_otp(req: VerifyOtpReq):
    user = await db.users.find_one({"username": req.username.lower()}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    if user.get("otp") != req.otp:
        raise HTTPException(400, "Invalid OTP")
    token = str(uuid.uuid4())
    await db.users.update_one({"id": user["id"]}, {"$set": {"verified": True, "token": token, "otp": None}})
    user.pop("password", None)
    user["token"] = token
    user["verified"] = True
    user.pop("otp", None)
    return {"ok": True, "token": token, "user": user}

@api_router.post("/auth/login")
async def login(req: LoginReq):
    ident = req.username.lower().strip()
    user = await db.users.find_one(
        {"$or": [{"username": ident}, {"email": ident}]},
        {"_id": 0},
    )
    if not user or not check_pw(req.password, user["password"]):
        raise HTTPException(401, "Invalid credentials")
    if not user.get("verified"):
        raise HTTPException(403, "Account not verified")
    token = str(uuid.uuid4())
    await db.users.update_one({"id": user["id"]}, {"$set": {"token": token}})
    user.pop("password", None)
    user["token"] = token
    if (user.get("username") or "").lower() == "darrenhustle300" or user.get("isAdmin"):
        user["isAdmin"] = True
        user["isUnlimited"] = True
    return {"ok": True, "token": token, "user": user}

@api_router.get("/auth/me")
async def me(authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    return user

@api_router.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordReq):
    if not req.email and not req.phone:
        raise HTTPException(400, "Provide an email or phone number")

    if req.email:
        email_lower = req.email.lower()
        user = await db.users.find_one({"email": email_lower}, {"_id": 0})
        if not user:
            return {"ok": True, "message": "If that email is registered, a reset link has been sent."}
        reset_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        await db.password_reset_tokens.insert_one({
            "token": reset_token,
            "userId": user["id"],
            "method": "email",
            "email": email_lower,
            "expiresAt": expires_at,
            "used": False,
            "createdAt": datetime.now(timezone.utc),
        })
        # Send the real email (falls back to demo if Resend not configured)
        app_url = os.environ.get("APP_URL", "https://morrisapp.co.uk")
        reset_link = f"{app_url}/reset-password?token={reset_token}"
        email_sent = False
        try:
            email_sent = await send_password_reset(email_lower, reset_link)
        except Exception as e:
            logger.warning(f"Reset email failed: {e}")
        return {
            "ok": True,
            "method": "email",
            "message": "Reset link generated.",
            "demoResetToken": reset_token,
            "demoResetLink": f"/reset-password?token={reset_token}",
            "emailSent": email_sent,
        }

    # Phone path — issue a 6-digit code
    phone = req.phone.strip()
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user:
        return {"ok": True, "message": "If that phone number is registered, a reset code has been sent."}
    code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    # Hash-free demo storage — code lives in the same collection alongside email tokens
    await db.password_reset_tokens.insert_one({
        "token": f"sms_{secrets.token_urlsafe(12)}",
        "userId": user["id"],
        "method": "phone",
        "phone": phone,
        "code": code,
        "expiresAt": expires_at,
        "used": False,
        "createdAt": datetime.now(timezone.utc),
    })
    return {
        "ok": True,
        "method": "phone",
        "message": "Reset code generated. (Demo: shown here.)",
        "demoResetCode": code,
    }

@api_router.post("/auth/reset-password")
async def reset_password(req: ResetPasswordReq):
    if len(req.newPassword) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    # Email-token path
    if req.token:
        record = await db.password_reset_tokens.find_one({"token": req.token}, {"_id": 0})
        if not record:
            raise HTTPException(400, "Invalid reset token")
    # Phone-code path
    elif req.phone and req.code:
        record = await db.password_reset_tokens.find_one(
            {"phone": req.phone.strip(), "code": req.code, "method": "phone"},
            {"_id": 0},
            sort=[("createdAt", -1)],
        )
        if not record:
            raise HTTPException(400, "Invalid phone or code")
    else:
        raise HTTPException(400, "Provide either a reset token or a phone + code")

    if record.get("used"):
        raise HTTPException(400, "This reset link has already been used")
    expires_at = record["expiresAt"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(400, "Reset link has expired")

    await db.users.update_one(
        {"id": record["userId"]},
        {"$set": {"password": hash_pw(req.newPassword)}, "$unset": {"token": ""}},
    )
    await db.password_reset_tokens.update_one(
        {"token": record["token"]},
        {"$set": {"used": True, "usedAt": datetime.now(timezone.utc)}},
    )
    return {"ok": True, "message": "Password updated. Please log in."}

@api_router.post("/profile/update")
async def update_profile(update: ProfileUpdate, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    patch = {k: v for k, v in update.model_dump().items() if v is not None}
    if patch:
        await db.users.update_one({"id": user["id"]}, {"$set": patch})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0, "otp": 0})
    return updated

@api_router.delete("/account/delete")
async def delete_account(authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    uid = user["id"]
    await db.documents.delete_many({"userId": uid})
    await db.cis_payments.delete_many({"userId": uid})
    await db.password_reset_tokens.delete_many({"userId": uid})
    await db.payment_transactions.delete_many({"userId": uid})
    await db.users.delete_one({"id": uid})
    return {"ok": True, "message": "Account and all data deleted."}

# ---------- Claude generate ----------
class VisionExtractReq(BaseModel):
    image: str  # base64 (without data URL prefix) or full data URL
    hint: Optional[str] = ""

@api_router.post("/vision/extract")
async def vision_extract(req: VisionExtractReq, authorization: Optional[str] = Header(None)):
    """Reads any text visible in an uploaded photo (handwritten notes, whiteboards,
    drawings) and returns a clean transcription plus a brief description of the image."""
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)

    # Strip data URL prefix if present
    img_b64 = req.image
    if img_b64.startswith("data:"):
        img_b64 = img_b64.split(",", 1)[-1]

    try:
        from emergentintegrations.llm.chat import ImageContent
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"morris-vision-{user['id']}-{uuid.uuid4()}",
            system_message=(
                "You are an OCR + scene assistant for a UK tradesperson. You are given a photo from a site "
                "(handwritten notes, whiteboards, drawings, scribbled instructions, signed documents). "
                "Reply in UK English with exactly two sections, no preamble, no markdown:\n"
                "TRANSCRIPTION:\n<the exact text visible in the image, line by line. If unreadable, write '(unreadable)'>\n\n"
                "DESCRIPTION:\n<one or two sentences describing what is in the photo and any context the user should preserve>"
            ),
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        msg = UserMessage(
            text=(req.hint or "Transcribe this photo and describe what it is."),
            file_contents=[ImageContent(img_b64)],
        )
        response = await chat.send_message(msg)
        return {"ok": True, "result": (response or "").replace("\u2014", " ").replace("\u2013", " ")}
    except Exception as e:
        logger.warning(f"Vision extract failed: {e}")
        raise HTTPException(422, "Image could not be processed. Please try a clearer photo.")


@api_router.post("/generate")
async def generate(req: GenerateReq, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)

    # Tier-gate: free users get FREE_TOOL_LIMIT distinct tools / FREE_DOC_LIMIT docs per month
    await check_can_generate(db, user, req.toolId)

    trade = req.trade or user.get("trade") or "tradesperson"
    company = req.companyName or user.get("companyName") or ""
    full_name = req.fullName or user.get("fullName") or user.get("username") or ""
    address = user.get("address") or ""
    contact_number = user.get("contactNumber") or user.get("phone") or ""
    utr = user.get("utr") or ""
    cis_status = user.get("cisStatus") or ""
    vat_registered = user.get("vatRegistered")
    vat_number = user.get("vatNumber") or ""
    user_email = user.get("email") or ""
    vehicle_reg = user.get("vehicleReg") or ""

    ref_number = await next_ref_number(user, req.toolId)
    today_str = datetime.now(timezone.utc).strftime("%d %B %Y")
    review_date_str = (datetime.now(timezone.utc) + timedelta(days=365)).strftime("%d %B %Y")

    # Tools that are NOT compliance / RAMS / COSHH / H&S documents and must
    # never receive an auto-generated 1-year review date. Site Diary is a
    # daily record; Variation Orders and other commercial documents are
    # one-off contractual instruments — they must never get a Review Date
    # in the header. The user can still pass an "optionalReviewDate" input
    # themselves; that value flows through the normal inputs block.
    NO_AUTO_REVIEW_DATE_TOOLS = {
        "site-diary", "multiuser-site-diary",
        # Commercial / contractual — never a review-cycle document:
        "variation-letter", "verbal-to-variation",
        "quote-builder", "price-work-quote", "tender-letter",
        "cis-invoice", "application-for-payment", "daywork-sheet",
        "subbie-payment-cert", "final-account-statement",
        "retention-chaser", "payment-chaser", "bad-debt-letter",
        "hmrc-correspondence", "complaint-letter",
        "delay-notice", "eot-claim", "practical-completion-certificate",
        "novation-letter", "contra-charge-dispute", "lds-dispute",
        "subcontract-letter", "reference-letter", "rate-increase-letter",
        "meeting-notes", "progress-report",
        "delivery-record", "purchase-order", "timesheet",
        "site-access-permit", "incident-report",
    }
    suppress_auto_review = req.toolId in NO_AUTO_REVIEW_DATE_TOOLS

    # Build a clean profile block — only include fields the user has actually filled.
    profile_lines = [f"Name: {full_name}", f"Trade: {trade}"]
    if company:
        profile_lines.append(f"Company: {company}")
    if address:
        profile_lines.append(f"Company address: {address}")
    if contact_number:
        profile_lines.append(f"Contact number: {contact_number}")
    if user_email:
        profile_lines.append(f"Email: {user_email}")
    if utr:
        profile_lines.append(f"UTR: {utr}")
    ni_number = user.get("nationalInsuranceNumber") or ""
    if ni_number:
        profile_lines.append(f"National Insurance number: {ni_number}")
    company_reg = user.get("companyRegNumber") or ""
    if company_reg:
        profile_lines.append(f"Company registration number: {company_reg}")
    if cis_status:
        profile_lines.append(f"CIS status: {cis_status}")
    if vat_registered is True and vat_number:
        profile_lines.append(f"VAT registered: yes, VAT number {vat_number}")
    elif vat_registered is False:
        profile_lines.append("VAT registered: no")
    # NOTE: Bank details are intentionally NOT in the global profile block.
    # They are injected separately below for an allowlisted set of tools only.
    if vehicle_reg:
        profile_lines.append(f"Vehicle registration: {vehicle_reg}")
    profile_block = "\n".join(profile_lines)

    # Bank details only for the allowlisted document set
    bank_block = ""
    if req.toolId in BANK_DETAILS_TOOLS:
        bank_block = _bank_details_block(user)

    system_prompt = (
        "You are Morris, an AI document writer for UK construction tradespeople. "
        "Always write in UK English.\n\n"
        "TONE AND LANGUAGE — STRICT, GLOBAL, NEVER OVERRIDE:\n"
        "Write in plain direct construction English at all times. Short sentences. One idea per sentence. Say exactly what you mean. No padding. "
        "Write as if you are an experienced tradesperson briefing your own gang. Confident, direct, professional enough to pass a principal contractor's site manager. Not corporate. Not cautious. "
        "BANNED WORDS AND PHRASES — never use these or anything similar: 'kinetic', 'facilitate', 'endeavour', 'utilise', 'operatives are advised', 'activities involving', 'implement', 'undertake', 'in order to', 'ensure that', 'shall be undertaken', 'prior to'. "
        "Write actions as direct instructions. Example: write 'Two-man lift anything over 10kg' NOT 'manual handling assessments to be conducted prior to lifting operations'. "
        "When describing a risk, state it plainly. Example: write 'Risk of falling from height' NOT 'activities involving elevation above ground level present a risk of gravitational impact'. "
        "Never explain legislation in paragraph form. List the Act or Reg by name, one line, and move on. "
        "Do NOT include BS EN reference numbers in PPE lists unless the user typed them in. "
        "Never add information the user did not ask for. "
        "Financial documents: clear and exact. Figures, dates, amounts with no ambiguity. "
        "Legal documents: firm but plain. A tradesperson must be able to read it out loud without stumbling.\n\n"
        # ---------- Morris Global Writing Standard (added Feb 2026) ----------
        # Reinforces the block above. Positions the Morris voice explicitly and
        # gives context-aware guidance per document family. Never overrides
        # tool-specific instructions later in this prompt.
        "MORRIS GLOBAL WRITING STANDARD:\n"
        "Write in clear, professional UK construction English. Sound like an experienced UK site manager, contracts manager or QS explaining something clearly to a competent tradesperson.\n"
        "The language must be professional enough to send to a principal contractor, main contractor, client, QS, site manager, accountant or other professional recipient — but simple enough that a tradesperson with little or no paperwork experience can understand it on first reading.\n"
        "Writing principles: plain English, UK spelling, short direct sentences where appropriate, active instructions, practical, specific, confident without overstating certainty, professional without sounding corporate. Use terminology that is commonly understood in UK construction. Preserve necessary technical and legal terminology where accuracy requires it; explain specialist terms only when the reader is unlikely to know them.\n"
        "Prefer 'Put the required control measures in place before starting work' over 'Operatives shall ensure the utilisation of appropriate control measures prior to commencement.' Prefer 'Store materials as close to the work area as possible to reduce unnecessary carrying' over 'Materials shall be stored as close as reasonably practicable to the designated working area.' Avoid casual phrasing such as 'Chuck your PPE on' — sit in the middle: professional, practical, direct, easy to understand.\n"
        "SAFETY AND LEGAL LANGUAGE RULE: Do NOT simplify wording in any way that reduces legal accuracy, health and safety accuracy, technical accuracy, contractual meaning, financial accuracy or tax accuracy. Where formal terminology is legally or technically required, retain it. Plain English must never come at the expense of correctness.\n"
        "CONTEXT-AWARE VOICE (adjust the professional perspective without breaking the Morris tone): "
        "RAMS / Risk Assessment / COSHH — write like an experienced UK construction H&S professional or site manager speaking clearly to operatives. "
        "Variation Orders / EOT / Applications for Payment — write like a UK contracts manager or QS using clear construction English. "
        "Invoices / CIS / Tax — write clearly and professionally using correct UK financial and HMRC terminology. "
        "Payment Chasers / Bad Debt — write firmly and professionally without unnecessary aggressive language. "
        "Site Diaries / Incident Reports — write factually and objectively; do not speculate. "
        "Quotes / Tenders — write professionally and commercially while remaining easy to understand. "
        "The Morris brand voice must remain recognisable across every tool.\n\n"
        # ---------- END Morris Global Writing Standard ----------
        "Reference UK construction law and practice where directly relevant: CIS, HMRC, HSE, CDM 2015, Housing Grants Construction and Regeneration Act 1996 (as amended). List by name, do not lecture.\n\n"
        "FORMATTING:\n"
        "Never use markdown headings (#) or asterisks. Use clean text, paragraph breaks, and capitalised section labels (e.g. 'SUBJECT:', 'TO:', 'SCOPE:').\n"
        "Do not use dashes, hyphens, em-dashes or en-dashes anywhere in the output unless the user typed them in themselves. Use clean spacing and line breaks.\n"
        "Never output placeholder text such as '[Your Company]', '[Insert Date]', 'TBC' or anything in square brackets. Use the auto-populated profile data below. If a field is missing, leave it out cleanly.\n\n"
        "DOCUMENT HEADER RULE: Every document MUST begin with a header block in this exact format:\n"
        "DOCUMENT REFERENCE: {ref}\n"
        "DATE: {today}\n"
        + ("This document is a daily record, NOT a compliance assessment. DO NOT include a 'REVIEW DATE' line in the header under any circumstances. If the user supplied an 'optionalReviewDate' input, surface it ONCE near the end of the body as 'Review date: <value>'. Otherwise omit the review date completely.\n"
           if suppress_auto_review else
           "If this is a compliance, RAMS, COSHH, H&S or assessment document also include:\n"
           "REVIEW DATE: {review}\n"
        )
        + "Then a blank line and the document body.\n"
        + "AUTHOR PROFILE (use these exact values wherever a name, company, address, UTR, VAT or CIS reference is needed):\n"
        + profile_block + "\n"
        "Personalise the document to this profile. Do not invent details.\n"
        + ("STRICT: For CIS Invoices, the subcontractor's National Insurance number MUST appear in the FROM block on its own line labelled 'NI No:'. This is non-negotiable for HMRC compliance.\n"
           if (req.toolId == "cis-invoice" and ni_number) else "")
        + "\n"
        + (bank_block + "\n\n" if bank_block else "")
        + (
            # ---------- Variation Order — tool-specific tightening ----------
            "VARIATION ORDER — TOOL-SPECIFIC RULES:\n"
            "1. Time Impact: 'Additional days' is a whole number of working days. NEVER format it with decimals or a currency symbol. Write it as e.g. '2 working days' (or '0 working days' if the user supplied 0/blank). Do not write '2.00' or '2000.00'.\n"
            "2. If the value the user supplied for 'timeImpact' is 0, blank, or clearly not a whole number of days, output the Time Impact section as: 'No additional programme impact identified at this stage. Any impact will be notified separately.' Do not invent a number.\n"
            "3. If the user did NOT supply a New Practical Completion date, do NOT print one. Omit that line entirely.\n"
            "4. Contract Clause: only render the 'CONTRACT CLAUSE' section if the user supplied a genuine clause reference (e.g. a numbered clause, contract section, or JCT/NEC reference). If the field is blank, missing, or simply repeats the instruction method (e.g. 'Site Instruction', 'Verbal', 'Email'), OMIT the whole 'CONTRACT CLAUSE' section — do not print a heading with placeholder or duplicated content.\n"
            "5. Cost Breakdown: only include rows the user actually supplied a value for. Never invent Plant, Preliminaries or Overheads figures. Show every figure to 2 decimals with '£' prefix. Show TOTAL VARIATION COST as the arithmetic sum of the rows above.\n"
            "6. VAT: if the user ticked 'addVat' (or supplied any 'vatRate'), print a 'Sub-total' row above the total, a 'VAT at N%' row (default 20% if a rate wasn't specified), and 'TOTAL VARIATION COST (inc. VAT)' as the final row. If VAT is not ticked, do NOT mention VAT at all.\n"
            "7. Voice: write like a UK contracts manager or QS explaining the change to the client. Plain, direct, no consultant filler. Avoid phrases like 'following revised site instructions', 'to accommodate changes to', 'in order to facilitate' — say what changed and why in one clean sentence. Never use markdown, asterisks or square-bracket placeholders.\n"
            "8. The reason for variation must be printed exactly as supplied ('Client Request', 'Unforeseen Site Condition', 'Design Error', 'Scope Change', 'Material Substitution', 'Other'). Do not paraphrase.\n\n"
            if req.toolId in {"variation-letter", "verbal-to-variation"} else ""
        )
        + (
            # ---------- Quote Builder — tool-specific tightening ----------
            "QUOTE BUILDER — TOOL-SPECIFIC RULES:\n"
            "1. Section discipline: 'Exclusions', 'Assumptions', 'Provisional Sums' and 'Payment Terms / Payment Schedule' are FOUR distinct sections. Never merge them, never let payment content leak into an Exclusions or Assumptions heading, and never let exclusions/assumptions text leak into the payment section.\n"
            "2. Deposit non-contradiction: The Payment Summary on Page 1 must NOT contradict the Detailed Payment Terms on later pages. If 'depositRequirement' is 'No deposit required', do NOT print any deposit line ANYWHERE in the document. If the selected paymentStructure already contains a deposit (e.g. '50% deposit / 50% on completion') and 'depositRequirement' is ALSO set to a percentage, treat depositRequirement as a STANDALONE deposit in ADDITION to the structure and label it clearly as such — never fold the two together silently.\n"
            "3. Custom deposit %: If depositRequirement is 'Custom %', use the value in 'depositCustomPercent'. If depositCustomPercent is blank or 0, omit the standalone deposit line completely.\n"
            "4. Custom payment schedule 100% validation: If paymentStructure is 'Custom payment schedule', parse each non-blank line of 'paymentSchedule' looking for a percentage. Sum them. If the sum is not exactly 100, output the block heading 'PAYMENT SCHEDULE VALIDATION' followed by 'Custom stage percentages sum to <sum>%, not 100%. Please correct before issuing this quote.' — and then print the raw user text without computing any £ amounts. If the sum is 100, compute and print the £ amount alongside every stage.\n"
            "5. GRAND TOTAL prominence: the GRAND TOTAL line on Page 1 must appear on its own line, in ALL-CAPS, prefixed with the £ symbol and to 2 decimal places. Do not surround it with additional prose on the same line.\n"
            "6. VAT rate handling: honour whichever of 'Zero Rate 0%', 'Reduced Rate 5%', 'Standard Rate 20%' the user selected per section. The VAT breakdown summary must list rates in ascending order (0% first, 20% last).\n"
            "7. Never invent Preliminaries. If subtotalPrelims is blank or 0, omit the Preliminaries row from every table and omit the section on Page 2.\n\n"
            if req.toolId == "quote-builder" else ""
        )
        + (
            # ---------- Application for Payment — tool-specific tightening ----------
            "APPLICATION FOR PAYMENT — TOOL-SPECIFIC RULES:\n"
            "1. CIS BASIS (HARD RULE): CIS is ONLY deducted from the labour value in this period ('labourThisPeriod'). Compute CIS = cisRate × labourThisPeriod, rounded to 2 decimals. Never deduct CIS as a percentage of the gross valuation, the net sum due after retention, or the amount previously applied. If labourThisPeriod is blank or zero, print 'CIS deduction: £0.00 (no labour claimed this period)'. If cisApplicable is 'No', omit CIS lines entirely — never say '20% of net sum'.\n"
            "2. VAT REVERSE CHARGE (HARD RULE): If vatStatus is 'Domestic reverse charge (CIS)', add ZERO VAT to the total and print the statutory phrase 'Domestic reverse charge for construction services applies (VAT Notice 735). Customer to account for VAT to HMRC.' Do NOT add a VAT amount. Do NOT print a 'GROSS AMOUNT PAYABLE INCLUDING VAT' line — the payable figure is the 'NET PAYABLE AFTER CIS'.\n"
            "3. PENDING VARIATIONS: Never add pending / notified variations into the GROSS VALUE OF WORKS TO DATE, and never into the sum applied for. They appear in a separate labelled block underneath the main valuation table titled 'PENDING VARIATIONS (notified — for information only, not included in the sum applied for)'. If none supplied, omit the block.\n"
            "4. RETENTION ON MATERIALS: If retentionOnMaterials is 'No' (default), the retention base excludes 'materialsOnSite' and 'materialsOffSite'. The printed retention line is labelled 'Less retention at N% (excluding materials on site)'. If retentionOnMaterials is 'Yes', apply retention to the full gross and label the line 'Less retention at N%' (without the exclusion note).\n"
            "5. STATUTORY REFS: Use s.110A(3) for the payee's notice and s.111 for Pay Less Notices. Do NOT say 'Notice for Payment served under Section 110' — s.110 is about payment DATES, not notices.\n"
            "6. SORT CODES: Format sort codes as NN-NN-NN (e.g. '60-00-01'). Never print a sort code as a run-on string like '600001'.\n"
            "7. NO PLACEHOLDER LEAKS: If the profile's signature role is missing, OMIT the 'Role:' line entirely. Never print '(role not set in profile)' or any parenthetical placeholder. Same for any other missing profile field.\n"
            "8. VAT ROUNDING: All VAT and interim totals rounded to 2 decimals with the '£' symbol.\n\n"
            if req.toolId == "application-for-payment" else ""
        )
        + (
            # ---------- Extension of Time Claim — tool-specific tightening ----------
            "EXTENSION OF TIME CLAIM — TOOL-SPECIFIC RULES:\n"
            "1. NEVER assume that a delay event automatically qualifies for an Extension of Time. Base entitlement wording ONLY on the contract mechanism the user supplied (formOfContract + branch fields). If none supplied, print: 'The Contractor's contractual mechanism is subject to confirmation and further review.'\n"
            "2. NEVER equate additional TIME with additional MONEY. An award of Extension of Time does NOT, of itself, entitle the Contractor to additional payment. Print exactly this sentence at the end of the Loss and Expense section: 'Entitlement to Extension of Time and entitlement to additional payment / loss and expense are separate contractual matters. An award of Extension of Time does not, of itself, entitle the Contractor to additional payment.'\n"
            "3. TERMINOLOGY BY CONTRACT: If formOfContract is 'NEC4', use NEC terminology throughout — 'Compensation Event' not 'Extension of Time claim', 'Project Manager' not 'Contract Administrator', 'the assessed change in Prices' not 'loss and expense', 'Programme' with capital P. Document title becomes 'NOTICE OF COMPENSATION EVENT — EXTENSION OF TIME'. Response section references clauses 61/62. If formOfContract is 'JCT' or 'Other / Bespoke', use JCT/UK-standard terminology.\n"
            "4. NOTICE COMPLIANCE: Never state that entitlement has been lost solely because notice was late unless the actual contract wording supplied by the user supports that conclusion. If contractualNoticeIssued = No, print exactly: 'No contractual notice has been issued in respect of this delay event. Contractual notice requirements should be checked immediately.'\n"
            "5. CONCURRENT DELAY: If concurrentDelay = Yes, identify concurrency as an issue requiring contractual assessment; NEVER automatically determine its legal effect on the EOT.\n"
            "6. TOTAL DELAY vs EOT REQUESTED: Print both figures. NEVER assume they are identical. Include the sentence: 'The Contractor draws a distinction between the total delay experienced and the Extension of Time contractually requested; the two are not automatically identical.'\n"
            "7. AUTO-CALC REVISED COMPLETION DATE: If revisedCompletionDate is blank, compute currentCompletionDate + eotDaysRequested (calendar days) and prefix the output with 'Revised completion date requested (calculated): '. If the supplied revisedCompletionDate does not reconcile with the arithmetic, print BOTH and a warning line.\n"
            "8. EVIDENCE SCHEDULE: Print the 12-row Supporting Evidence Schedule verbatim from the user's inputs. NEVER invent evidence, RFIs, meeting minutes, weather records or any other reference. If a category is blank, print 'Not supplied'.\n"
            "9. NO PLACEHOLDERS: Do NOT emit '[INSERT CLAUSE]', '[ROLE NOT SET]', '[DATE REQUIRED]' or any square-bracket placeholder. Omit the section, or state cleanly that the information has not been provided.\n"
            "10. TONE: professional, factual, contractually aware, concise but detailed, non-emotional. Preserve the Contractor's position WITHOUT making unsupported legal claims. Do NOT make the document unnecessarily aggressive.\n\n"
            if req.toolId == "eot-claim" else ""
        )
        + _signoff_instructions(req.toolId, user, bool(user.get("signature")))
    )

    inputs_text = "\n".join(f"- {k}: {v}" for k, v in req.userInputs.items() if v)
    user_msg = (
        f"Tool: {req.toolName}\n"
        f"Document reference (use this in the header): {ref_number}\n"
        f"Today's date: {today_str}\n"
        + (
            ""  # Site Diary etc. — no auto review date
            if suppress_auto_review else
            f"Review date (if applicable): {review_date_str}\n"
        )
        + f"Trade: {trade}\n"
        f"User details:\n{inputs_text or '(none provided)'}\n\n"
        f"Instructions: {req.promptTemplate}\n\n"
        "Produce the final document text only — no preamble, no explanation."
    )

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"morris-{user['id']}-{req.toolId}-{uuid.uuid4()}",
            system_message=system_prompt,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        response = await chat.send_message(UserMessage(text=user_msg))
        # Safety net: strip any en-dashes / em-dashes the model might still emit.
        # We deliberately keep ASCII hyphens because legitimate inputs (postcodes,
        # phone numbers, double-barrelled names) may contain them.
        cleaned = (response or "").replace("\u2014", " ").replace("\u2013", " ")
        # Safety net: strip the worst consultant-style phrases. We replace,
        # not fail, so the user always gets a document back.
        BANNED_REPLACEMENTS = {
            "operatives are advised to ": "",
            "operatives are advised ": "",
            "activities involving ": "",
            "in order to ": "to ",
            "shall be undertaken ": "happens ",
            "is to be undertaken ": "happens ",
            "is to be implemented ": "is in place ",
            "shall be implemented ": "is in place ",
            "ensure that ": "make sure ",
            " utilise ": " use ",
            " utilised": " used",
            " endeavour to ": " try to ",
            " endeavour ": " try ",
            " facilitate ": " help with ",
            " kinetic ": " ",
            " prior to ": " before ",
        }
        lc = cleaned
        for bad, repl in BANNED_REPLACEMENTS.items():
            lc = lc.replace(bad, repl)
            lc = lc.replace(bad.capitalize(), repl.capitalize() if repl else "")
        cleaned = lc

        # Safety net: CIS Invoice MUST always carry the subcontractor's National
        # Insurance number if it is on the profile. HMRC compliance requirement.
        # If the model dropped it, inject it under the UTR line.
        if req.toolId == "cis-invoice" and ni_number:
            ni_present = ("NI No" in cleaned) or (ni_number in cleaned) or ("National Insurance" in cleaned)
            if not ni_present:
                # Try to inject right after the UTR line (case-insensitive scan).
                lines = cleaned.split("\n")
                injected = False
                for idx, line in enumerate(lines):
                    if "UTR" in line.upper():
                        lines.insert(idx + 1, f"NI No: {ni_number}")
                        injected = True
                        break
                if not injected:
                    # Fallback: prepend under the FROM block if present.
                    for idx, line in enumerate(lines):
                        if line.strip().upper().startswith("FROM"):
                            lines.insert(idx + 1, f"NI No: {ni_number}")
                            injected = True
                            break
                if not injected:
                    # Last resort: stick it at the very top of the body.
                    lines.insert(0, f"NI No: {ni_number}")
                cleaned = "\n".join(lines)

        await record_usage(db, user, req.toolId)
        # Auto-save every generated document to the user's Document Vault
        try:
            await db.documents.insert_one({
                "id": str(uuid.uuid4()),
                "userId": user["id"],
                "title": req.toolName,
                "toolId": req.toolId,
                "refNumber": ref_number,
                "jobId": req.jobId,
                "content": cleaned,
                "autoSaved": True,
                "createdAt": datetime.now(timezone.utc),
            })
        except Exception:
            logger.exception("Auto-save to vault failed (non-fatal)")
        return {"ok": True, "content": cleaned, "refNumber": ref_number}
    except Exception as e:
        logger.exception("Generate failed")
        raise HTTPException(500, f"Generation failed: {str(e)}")

# ---------- Documents ----------
@api_router.post("/documents/save")
async def save_document(d: DocumentSave, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    doc = {
        "id": str(uuid.uuid4()),
        "userId": user["id"],
        "title": d.title,
        "toolId": d.toolId,
        "refNumber": d.refNumber,
        "jobId": d.jobId,
        "content": d.content,
        "metadata": d.metadata or {},
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.documents.insert_one(doc)
    # Emit project timeline event when saved doc is linked to a job
    if d.jobId:
        try:
            kind_map = {
                "rams": "rams_created",
                "method-statement": "method_statement_created",
                "toolbox-talk": "toolbox_talk_delivered",
                "coshh": "coshh_created",
                "variation-letter": "variation_submitted",
                "cis-invoice": "invoice_generated",
                "application-for-payment": "application_submitted",
                "site-diary": "site_diary_created",
                "multiuser-site-diary": "site_diary_created",
                "payment-chaser": "chase_sent",
            }
            event_kind = kind_map.get(d.toolId, "document_saved")
            await emit_project_event(
                db, user, d.jobId, event_kind,
                d.title or event_kind.replace("_", " ").title(),
                d.refNumber or "",
                ref_doc_id=doc["id"],
            )
        except Exception:
            logger.warning("Failed to emit doc save event")
    doc.pop("_id", None)
    return doc

@api_router.get("/documents")
async def list_documents(authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    docs = await db.documents.find({"userId": user["id"]}, {"_id": 0}).sort("createdAt", -1).to_list(500)
    return docs

@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    await db.documents.delete_one({"id": doc_id, "userId": user["id"]})
    return {"ok": True}

# ---------- Jobs (Job Tracker) ----------
async def _next_job_ref(user: dict) -> str:
    """Returns JOB-{INITIALS}-{NNNN} with a per-user counter."""
    res = await db.users.find_one_and_update(
        {"id": user["id"]},
        {"$inc": {"jobCounter": 1}},
        return_document=True,
    )
    seq = (res or {}).get("jobCounter", 1)
    return f"JOB-{_ref_initials(user)}-{seq:04d}"


@api_router.post("/jobs")
async def create_job(job: JobCreate, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    ref = await _next_job_ref(user)
    doc = {
        "id": str(uuid.uuid4()),
        "userId": user["id"],
        "ref": ref,
        "status": "active",
        **job.model_dump(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.jobs.insert_one(doc)
    # Timeline event
    try:
        await emit_project_event(db, user, doc["id"], "project_created", "Project created", doc.get("clientName") or "")
    except Exception:
        logger.warning("Failed to emit project_created event")
    doc.pop("_id", None)
    return doc


@api_router.get("/jobs")
async def list_jobs(authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    items = await db.jobs.find({"userId": user["id"]}, {"_id": 0}).sort("createdAt", -1).to_list(500)
    return items


@api_router.get("/jobs/{job_id}")
async def get_job(job_id: str, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    job = await db.jobs.find_one({"id": job_id, "userId": user["id"]}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    docs = await db.documents.find({"userId": user["id"], "jobId": job_id}, {"_id": 0}).sort("createdAt", 1).to_list(500)
    return {"job": job, "documents": docs}


@api_router.patch("/jobs/{job_id}")
async def update_job(job_id: str, update: JobUpdate, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    patch = {k: v for k, v in update.model_dump().items() if v is not None}
    if "status" in patch and patch["status"] not in JOB_STATUSES:
        raise HTTPException(400, f"Status must be one of {JOB_STATUSES}")
    if patch:
        result = await db.jobs.update_one({"id": job_id, "userId": user["id"]}, {"$set": patch})
        if result.matched_count == 0:
            raise HTTPException(404, "Job not found")
        # Emit status change events for major transitions
        if "status" in patch:
            try:
                new_status = patch["status"]
                if new_status == "completed":
                    await emit_project_event(db, user, job_id, "project_completed", "Project marked complete")
                elif new_status == "archived":
                    await emit_project_event(db, user, job_id, "project_archived", "Project archived")
                else:
                    await emit_project_event(db, user, job_id, "status_changed", f"Status set to {new_status}")
            except Exception:
                logger.warning("Failed to emit status event")
    updated = await db.jobs.find_one({"id": job_id, "userId": user["id"]}, {"_id": 0})
    return updated


@api_router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    # Unlink any documents from this job so they aren't lost (just orphan them)
    await db.documents.update_many({"userId": user["id"], "jobId": job_id}, {"$set": {"jobId": None}})
    await db.jobs.delete_one({"id": job_id, "userId": user["id"]})
    return {"ok": True}


# ---------- CIS Payments ----------
@api_router.post("/cis/payments")
async def add_cis(p: CISPayment, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)

    # Server-side authoritative calc. Frontend cannot override deduction/net.
    gross_labour = float(p.grossLabour if p.grossLabour is not None else (p.gross or 0))
    materials = float(p.materials or 0)
    cis_rate = float(p.cisRate if p.cisRate is not None else 0.20)
    if cis_rate not in (0.20, 0.30, 0.0):
        cis_rate = 0.20
    deduction = round(gross_labour * cis_rate, 2)
    gross_total = round(gross_labour + materials, 2)
    net = round(gross_total - deduction, 2)

    doc = {
        "id": str(uuid.uuid4()),
        "userId": user["id"],
        "date": p.date,
        "contractor": p.contractor,
        "grossLabour": round(gross_labour, 2),
        "materials": round(materials, 2),
        "cisRate": cis_rate,
        "deduction": deduction,
        "gross": gross_total,   # legacy alias — total gross invoice value
        "net": net,
        "notes": p.notes or "",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.cis_payments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/cis/payments")
async def list_cis(authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    items = await db.cis_payments.find({"userId": user["id"]}, {"_id": 0}).sort("date", -1).to_list(500)
    # Backfill grossLabour / materials / cisRate on older records so the
    # frontend can render them consistently.
    for it in items:
        if "grossLabour" not in it or it.get("grossLabour") is None:
            it["grossLabour"] = float(it.get("gross") or 0)
            it["materials"] = 0.0
            ded = float(it.get("deduction") or 0)
            gl = it["grossLabour"]
            it["cisRate"] = round(ded / gl, 2) if gl > 0 else 0.20
    return items

@api_router.delete("/cis/payments/{pid}")
async def del_cis(pid: str, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    await db.cis_payments.delete_one({"id": pid, "userId": user["id"]})
    return {"ok": True}


@api_router.put("/cis/payments/{pid}")
async def update_cis(pid: str, p: CISPayment, authorization: Optional[str] = Header(None)):
    """Edit an existing CIS payment. Server recomputes deduction/gross/net
    from the new structured fields exactly like the POST endpoint, so the
    user can never override authoritative figures.
    """
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)

    gross_labour = float(p.grossLabour if p.grossLabour is not None else (p.gross or 0))
    materials = float(p.materials or 0)
    cis_rate = float(p.cisRate if p.cisRate is not None else 0.20)
    if cis_rate not in (0.20, 0.30, 0.0):
        cis_rate = 0.20
    deduction = round(gross_labour * cis_rate, 2)
    gross_total = round(gross_labour + materials, 2)
    net = round(gross_total - deduction, 2)

    updates = {
        "date": p.date,
        "contractor": p.contractor,
        "grossLabour": round(gross_labour, 2),
        "materials": round(materials, 2),
        "cisRate": cis_rate,
        "deduction": deduction,
        "gross": gross_total,
        "net": net,
        "notes": p.notes or "",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.cis_payments.update_one(
        {"id": pid, "userId": user["id"]},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Payment not found")
    doc = await db.cis_payments.find_one({"id": pid, "userId": user["id"]}, {"_id": 0})
    return doc


# ---------- Drafts ----------
# Mid-form save/resume. Stored per-user, per-tool. Validation is intentionally
# permissive so users can capture progress at any point, even with required
# fields blank.

@api_router.get("/drafts")
async def list_drafts(authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    cursor = db.drafts.find(
        {"userId": user["id"]},
        {"_id": 0, "data": 0},  # don't ship full body in the list view
    ).sort("updatedAt", -1)
    return await cursor.to_list(length=500)


@api_router.get("/drafts/{draft_id}")
async def get_draft(draft_id: str, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    doc = await db.drafts.find_one({"id": draft_id, "userId": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Draft not found")
    return doc


@api_router.post("/drafts")
async def save_draft(req: DraftSave, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    now_iso = datetime.now(timezone.utc).isoformat()
    title = (req.title or "").strip() or f"{req.toolName} draft"

    if req.draftId:
        # Update existing — guarded by userId so users can't poke each other's drafts.
        result = await db.drafts.update_one(
            {"id": req.draftId, "userId": user["id"]},
            {"$set": {
                "title": title,
                "data": req.data,
                "updatedAt": now_iso,
            }},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Draft not found")
        doc = await db.drafts.find_one({"id": req.draftId, "userId": user["id"]}, {"_id": 0})
        return doc

    # Create
    draft_id = str(uuid.uuid4())
    doc = {
        "id": draft_id,
        "userId": user["id"],
        "toolId": req.toolId,
        "toolName": req.toolName,
        "title": title,
        "data": req.data,
        "createdAt": now_iso,
        "updatedAt": now_iso,
    }
    await db.drafts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/drafts/{draft_id}")
async def delete_draft(draft_id: str, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    result = await db.drafts.delete_one({"id": draft_id, "userId": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Draft not found")
    return {"ok": True}


# ---------- CIS Refund Summary → email to accountant ----------
class RefundSummaryEmail(BaseModel):
    accountantEmail: EmailStr
    accountantName: Optional[str] = ""
    taxYear: str  # "2025/26"
    pdfBase64: str  # data URL or raw base64 of the PDF generated client-side


@api_router.post("/cis/refund-summary/email")
async def email_refund_summary(req: RefundSummaryEmail, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)

    # Strip data URL prefix if present, decode base64
    raw = req.pdfBase64
    if "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        pdf_bytes = base64.b64decode(raw)
    except Exception as e:
        raise HTTPException(400, f"Could not decode PDF: {e}")
    if len(pdf_bytes) < 200:
        raise HTTPException(400, "PDF is empty or unreadable.")
    if len(pdf_bytes) > 8 * 1024 * 1024:
        raise HTTPException(400, "PDF too large. Keep under 8MB.")

    sender_name = user.get("fullName") or user.get("username") or ""
    sender_email = user.get("email") or ""

    ok = await send_refund_summary(
        to=str(req.accountantEmail),
        sender_name=sender_name,
        sender_email=sender_email,
        tax_year=req.taxYear,
        pdf_bytes=pdf_bytes,
    )
    return {"ok": True, "emailSent": ok, "to": str(req.accountantEmail)}


# ---------- Allowable Expenses ----------
EXPENSE_CATEGORIES = ["tools", "fuel", "ppe", "training", "insurance", "accountant", "phone", "marketing", "materials", "mileage", "other"]


@api_router.post("/expenses")
async def add_expense(e: ExpenseEntry, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    cat = (e.category or "other").lower()
    if cat not in EXPENSE_CATEGORIES:
        cat = "other"
    doc = {
        "id": str(uuid.uuid4()),
        "userId": user["id"],
        "date": e.date,
        "category": cat,
        "description": e.description or "",
        "amount": round(float(e.amount or 0), 2),
        "notes": e.notes or "",
        "source": "manual",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/expenses")
async def list_expenses(authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    items = await db.expenses.find({"userId": user["id"]}, {"_id": 0}).sort("date", -1).to_list(2000)
    return items


@api_router.delete("/expenses/{eid}")
async def del_expense(eid: str, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    await db.expenses.delete_one({"id": eid, "userId": user["id"], "source": "manual"})
    return {"ok": True}

# ---------- Team Management ----------
TEAM_ROLES = ["owner", "admin", "manager", "member"]


class TeamInvite(BaseModel):
    email: EmailStr
    role: str = "member"  # one of TEAM_ROLES (excluding owner)


class TeamRoleUpdate(BaseModel):
    role: str  # admin | manager | member


def _team_owner_id(user: dict) -> str:
    """Returns the owner-account id for a user. Owner accounts return their own id."""
    return user.get("teamOwnerId") or user["id"]


async def _seat_limits_for_owner(owner_id: str) -> tuple[int, int, str]:
    """Returns (current_seats, seat_limit, plan_id) for the owner's plan."""
    from billing import PLANS as _PLANS, SEAT_LIMITS as _SEATS, effective_plan as _eff
    owner = await db.users.find_one({"id": owner_id}, {"_id": 0})
    plan = _eff(owner or {})
    limit = _SEATS.get(plan, 1)
    # Count owner + active members tagged to this owner
    members = await db.users.count_documents({"$or": [{"id": owner_id}, {"teamOwnerId": owner_id}]})
    return (members, limit, plan)


async def _require_team_admin(user: dict):
    """Owner OR admin can manage the team. Otherwise 403."""
    role = user.get("teamRole") or ("owner" if not user.get("teamOwnerId") else "member")
    if role not in ("owner", "admin"):
        raise HTTPException(403, "Only the account owner or admins can manage the team.")


def _can_use_manager_role(plan: str) -> bool:
    """Manager role is exclusive to Enterprise (and admin/unlimited)."""
    return plan in ("enterprise", "unlimited")


@api_router.post("/team/invite")
async def team_invite(req: TeamInvite, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    await _require_team_admin(user)

    if req.role not in ("admin", "manager", "member"):
        raise HTTPException(400, "Role must be one of: admin, manager, member.")

    # Pro doesn't have manager role; Enterprise does
    owner_id = _team_owner_id(user)
    current, limit, plan = await _seat_limits_for_owner(owner_id)
    if plan == "free" or plan == "trial":
        raise HTTPException(402, "Team invites require a Business, Pro or Enterprise plan.")
    if plan == "solo":
        raise HTTPException(402, "Solo plans are single-user. Upgrade to Business, Pro or Enterprise to invite team members.")
    if req.role == "manager" and not _can_use_manager_role(plan):
        raise HTTPException(400, "The Manager role is only available on Enterprise plans.")
    if current >= limit:
        raise HTTPException(400, f"You have reached your plan's seat limit ({limit}). Upgrade or remove a member to invite more.")

    # Prevent inviting an already-registered email that's on a different team
    email_lower = req.email.lower()
    existing = await db.users.find_one({"email": email_lower}, {"_id": 0})
    if existing:
        if existing.get("teamOwnerId") == owner_id or existing.get("id") == owner_id:
            raise HTTPException(400, "That email is already part of your team.")
        raise HTTPException(400, "That email is already registered with another account.")

    invite_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=14)
    await db.team_invites.insert_one({
        "token": invite_token,
        "ownerId": owner_id,
        "ownerUsername": user.get("username") if user.get("id") == owner_id else None,
        "email": email_lower,
        "role": req.role,
        "expiresAt": expires_at,
        "accepted": False,
        "createdAt": datetime.now(timezone.utc),
    })

    # Fire-and-forget the invite email
    app_url = os.environ.get("APP_URL", "https://morrisapp.co.uk")
    invite_link = f"{app_url}/accept-invite?token={invite_token}"
    try:
        from email_helper import send_email
        owner_name = user.get("companyName") or user.get("fullName") or user.get("username") or "Morris user"
        await send_email(
            email_lower,
            f"You've been invited to join {owner_name} on Morris",
            f"""
            <p style="font-size:18px;color:#F0EDE8;margin:0 0 12px 0;">Join {owner_name} on Morris.</p>
            <p><strong>{owner_name}</strong> has invited you to join their Morris account as a <strong style="color:#E8A020;">{req.role}</strong>.</p>
            <p>Morris is the construction admin app for UK tradesmen. Variation letters, RAMS, CIS invoices, retention chasers and 80+ more tools, all in your pocket.</p>
            <p style="margin:28px 0;text-align:center;">
              <a href="{invite_link}" style="background:#E8A020;color:#060606;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:6px;display:inline-block;">Accept invite</a>
            </p>
            <p style="color:#A19D94;font-size:13px;">Or paste this link into your browser:<br/><span style="color:#E8A020;word-break:break-all;">{invite_link}</span></p>
            <p style="color:#706D66;font-size:13px;">This invite expires in 14 days.</p>
            """,
            preheader=f"Join {owner_name} on Morris.",
        )
    except Exception as e:
        logger.warning(f"Team invite email failed: {e}")

    return {
        "ok": True,
        "inviteLink": invite_link,
        "demoInviteToken": invite_token,
        "expiresAt": expires_at.isoformat(),
    }


class AcceptInviteReq(BaseModel):
    token: str
    username: str
    password: str
    fullName: Optional[str] = None
    phone: Optional[str] = None


@api_router.post("/team/accept-invite")
async def team_accept_invite(req: AcceptInviteReq):
    inv = await db.team_invites.find_one({"token": req.token}, {"_id": 0})
    if not inv or inv.get("accepted"):
        raise HTTPException(400, "Invalid or already-used invite link.")
    expires_at = inv["expiresAt"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(400, "This invite has expired.")

    username_lower = req.username.lower().strip()
    if await db.users.find_one({"username": username_lower}, {"_id": 0}):
        raise HTTPException(400, "That username is taken.")
    if await db.users.find_one({"email": inv["email"]}, {"_id": 0}):
        raise HTTPException(400, "That email is already registered.")
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters.")

    token = str(uuid.uuid4())
    new_user = {
        "id": str(uuid.uuid4()),
        "username": username_lower,
        "email": inv["email"],
        "password": hash_pw(req.password),
        "phone": req.phone or "",
        "fullName": req.fullName or "",
        "verified": True,  # invited users skip OTP
        "token": token,
        "teamOwnerId": inv["ownerId"],
        "teamRole": inv["role"],
        "trade": None,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(new_user)
    await db.team_invites.update_one(
        {"token": req.token},
        {"$set": {"accepted": True, "acceptedAt": datetime.now(timezone.utc), "acceptedBy": new_user["id"]}},
    )
    new_user.pop("password", None)
    new_user.pop("_id", None)
    return {"ok": True, "token": token, "user": new_user}


@api_router.get("/team/members")
async def team_members(authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    owner_id = _team_owner_id(user)
    current, limit, plan = await _seat_limits_for_owner(owner_id)
    members = await db.users.find(
        {"$or": [{"id": owner_id}, {"teamOwnerId": owner_id}]},
        {"_id": 0, "password": 0, "token": 0, "otp": 0, "signature": 0, "cscsCardFront": 0, "cscsCardBack": 0, "companyLogo": 0},
    ).to_list(500)
    pending = await db.team_invites.find(
        {"ownerId": owner_id, "accepted": False},
        {"_id": 0, "token": 0},
    ).to_list(200)
    # Annotate the owner
    for m in members:
        if m["id"] == owner_id and not m.get("teamRole"):
            m["teamRole"] = "owner"
    return {
        "plan": plan,
        "seats": {"used": current, "limit": limit},
        "members": members,
        "pendingInvites": pending,
    }


@api_router.patch("/team/members/{member_id}")
async def team_update_role(member_id: str, update: TeamRoleUpdate, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    await _require_team_admin(user)
    if update.role not in ("admin", "manager", "member"):
        raise HTTPException(400, "Role must be one of: admin, manager, member.")
    owner_id = _team_owner_id(user)
    if member_id == owner_id:
        raise HTTPException(400, "You cannot change the owner's role.")
    target = await db.users.find_one({"id": member_id, "teamOwnerId": owner_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Team member not found.")
    # Manager role gated to Enterprise (and unlimited/admin)
    _, _, plan = await _seat_limits_for_owner(owner_id)
    if update.role == "manager" and not _can_use_manager_role(plan):
        raise HTTPException(400, "The Manager role is only available on Enterprise plans.")
    await db.users.update_one({"id": member_id}, {"$set": {"teamRole": update.role}})
    return {"ok": True, "memberId": member_id, "role": update.role}


@api_router.delete("/team/members/{member_id}")
async def team_remove_member(member_id: str, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    await _require_team_admin(user)
    owner_id = _team_owner_id(user)
    if member_id == owner_id:
        raise HTTPException(400, "You cannot remove the account owner.")
    target = await db.users.find_one({"id": member_id, "teamOwnerId": owner_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Team member not found.")
    # Don't delete their data — just detach from team and invalidate session
    await db.users.update_one(
        {"id": member_id},
        {"$set": {"teamOwnerId": None, "teamRole": None, "plan": "free", "planExpiresAt": None}, "$unset": {"token": ""}},
    )
    return {"ok": True}


@api_router.delete("/team/invites/{invite_token}")
async def team_cancel_invite(invite_token: str, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    await _require_team_admin(user)
    owner_id = _team_owner_id(user)
    await db.team_invites.delete_one({"token": invite_token, "ownerId": owner_id, "accepted": False})
    return {"ok": True}


# ---------- Health ----------
@api_router.get("/")
async def root():
    return {"app": "Morris API", "status": "ok"}

app.include_router(api_router)

# Billing routes (Stripe checkout, trial, status) + public webhook
app.include_router(build_billing_router(db, get_user, send_subscription_receipt))
app.include_router(build_webhook_router(db, send_subscription_receipt))

# Photo Vault (Emergent Object Storage backed media library)
app.include_router(build_photo_vault_router(db, get_user))

# Command Centre V2 (attention feed)
app.include_router(build_command_centre_router(db, get_user))

# Project Workspace (tasks, events, stats, search)
app.include_router(build_project_workspace_router(db, get_user))

# Compliance Hub (credentials, insurance, personnel, vehicles)
app.include_router(build_compliance_router(db, get_user))

# Method Statement templates (work-sequence library)
app.include_router(build_method_statement_router(db, get_user))

# Toolbox Talks V2 (topic library + templates + stats)
app.include_router(build_toolbox_talks_router(db, get_user))

# COSHH V2 (hazardous substance management)
app.include_router(build_coshh_router(db, get_user))

# Site Diary V2 (daily site management)
app.include_router(build_site_diary_router(db, get_user))

# Incident Report V2 (incident investigation & management)
app.include_router(build_incident_report_router(db, get_user))

# Risk Assessment V2 (central H&S risk record)
app.include_router(build_risk_assessment_router(db, get_user))

# Quote Builder V2 (estimating & quotation)
app.include_router(build_quote_builder_router(db, get_user))

# Variation Orders V2 (flagship variation management)
app.include_router(build_variation_orders_router(db, get_user))

# Applications for Payment V2 (flagship payment application system)
app.include_router(build_afp_router(db, get_user))

# Invoice Builder V2 (flagship invoicing system)
app.include_router(build_invoice_router(db, get_user))

# Purchase Orders V2 (flagship procurement management)
app.include_router(build_purchase_orders_router(db, get_user))

# Contract Management V2 (flagship contract administration hub)
app.include_router(build_contracts_router(db, get_user))

# Snagging Lists V2 (flagship defect & quality management)
app.include_router(build_snagging_router(db, get_user))

# Global Search V2 (universal cross-tool search)
app.include_router(build_search_router(db, get_user))

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("username", unique=True)
        await db.users.create_index("email", unique=True, sparse=True)
        await db.password_reset_tokens.create_index("token", unique=True)
        # TTL index — MongoDB auto-purges reset tokens at expiresAt
        await db.password_reset_tokens.create_index("expiresAt", expireAfterSeconds=0)
        # Photo Vault indexes
        await db.media_items.create_index([("userId", 1), ("createdAt", -1)])
        await db.media_items.create_index([("userId", 1), ("jobId", 1)])
        await db.media_items.create_index([("userId", 1), ("category", 1)])
        await db.media_items.create_index([("userId", 1), ("favourite", 1)])
        await db.media_items.create_index([("userId", 1), ("album", 1)])
        await db.media_items.create_index([("userId", 1), ("tool", 1)])
        await db.media_items.create_index([("userId", 1), ("usage.docId", 1)])
        # Project Workspace indexes
        await db.project_tasks.create_index([("userId", 1), ("jobId", 1), ("createdAt", -1)])
        await db.project_events.create_index([("userId", 1), ("jobId", 1), ("createdAt", -1)])
        await db.documents.create_index([("userId", 1), ("jobId", 1)])
    except Exception as e:
        logger.warning(f"Index creation: {e}")
    # Initialise Emergent Object Storage session (non-fatal on failure)
    try_init_photo_vault_storage()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
