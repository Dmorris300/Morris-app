from fastapi import FastAPI, APIRouter, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import secrets
import uuid
import bcrypt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage
from email_helper import (
    send_password_reset, send_welcome, send_subscription_receipt,
    send_admin_signup,
)
from billing import build_router as build_billing_router, build_webhook_router, check_can_generate, record_usage, effective_plan

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
    email: Optional[EmailStr] = None
    favourites: Optional[List[str]] = None
    recentlyUsed: Optional[List[str]] = None

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
    date: str
    contractor: str
    gross: float
    deduction: float
    net: float
    notes: Optional[str] = ""

# ---------- Jobs ----------
JOB_STATUSES = ["active", "invoiced", "completed", "disputed"]

class JobCreate(BaseModel):
    clientName: str
    address: Optional[str] = ""
    contractValue: Optional[float] = 0.0
    startDate: Optional[str] = None
    expectedCompletion: Optional[str] = None
    notes: Optional[str] = ""

class JobUpdate(BaseModel):
    clientName: Optional[str] = None
    address: Optional[str] = None
    contractValue: Optional[float] = None
    startDate: Optional[str] = None
    expectedCompletion: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

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
    counter_key = f"docCounters.{tool_id}.{ymd}"
    res = await db.users.find_one_and_update(
        {"id": user["id"]},
        {"$inc": {counter_key: 1}},
        return_document=True,
    )
    seq = (((res or {}).get("docCounters") or {}).get(tool_id) or {}).get(ymd, 1)
    return f"{_ref_abbr(tool_id)}-{_ref_initials(user)}-{ymd}-{seq:03d}"


# ---------- Global sign-off classification (added Feb 2026) ----------
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
        client_block = (
            "CLIENT SIGN-OFF (to be completed by the recipient)\n"
            "Name: ____________________________\n"
            "Role: ____________________________\n"
            "Company: ____________________________\n"
            "Date and time: ____________________________\n"
            "Signature: ____________________________\n"
        )
        return (
            "MANDATORY SIGN-OFF BLOCKS: Every document MUST end with the following two sign-off blocks, "
            "in this exact format, on their own lines, separated by a single blank line. "
            "Use the contractor values exactly as provided. Leave the client block as labelled blank lines "
            "with underscores so it can be completed by hand or counter-signed.\n\n"
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
    bank_details = user.get("bankDetails") or ""
    vehicle_reg = user.get("vehicleReg") or ""

    ref_number = await next_ref_number(user, req.toolId)
    today_str = datetime.now(timezone.utc).strftime("%d %B %Y")
    review_date_str = (datetime.now(timezone.utc) + timedelta(days=365)).strftime("%d %B %Y")

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
    if cis_status:
        profile_lines.append(f"CIS status: {cis_status}")
    if vat_registered is True and vat_number:
        profile_lines.append(f"VAT registered: yes, VAT number {vat_number}")
    elif vat_registered is False:
        profile_lines.append("VAT registered: no")
    if bank_details:
        profile_lines.append(f"Bank details for payment: {bank_details}")
    if vehicle_reg:
        profile_lines.append(f"Vehicle registration: {vehicle_reg}")
    profile_block = "\n".join(profile_lines)

    system_prompt = (
        "You are Morris, an AI document writer for UK construction tradespeople. "
        "Always write in UK English. Reference UK construction law and practice where relevant, "
        "including the Construction Industry Scheme (CIS), HMRC, HSE, CDM 2015 regulations, "
        "and the Housing Grants, Construction and Regeneration Act 1996 (as amended). "
        "Output professional, plain English documents — clear, firm, polite and well-structured. "
        "Never use markdown headings (#) or asterisks; use clean text, paragraph breaks, and capitalised section labels (e.g. 'SUBJECT:', 'TO:'). "
        "STRICT FORMATTING RULE: Do not use dashes, hyphens, em-dashes, en-dashes or any similar punctuation anywhere in the output unless the user has typed them in themselves as part of their own input. Use clean spacing, line breaks and capitalised section labels instead. "
        "STRICT PLACEHOLDER RULE: Never output placeholder text such as '[Your Company]', '[Insert Date]', 'TBC' or anything in square brackets. Use the auto-populated profile data below for every name, company, address, contact, UTR, VAT and CIS reference. If a profile field is missing, leave it out cleanly instead of using a placeholder. "
        "DOCUMENT HEADER RULE: Every document MUST begin with a header block in this exact format:\n"
        "DOCUMENT REFERENCE: {ref}\n"
        "DATE: {today}\n"
        "If this is a compliance, RAMS, COSHH, H&S or assessment document also include:\n"
        "REVIEW DATE: {review}\n"
        "Then a blank line and the document body.\n"
        .format(ref=ref_number, today=today_str, review=review_date_str)
        + "AUTHOR PROFILE (use these exact values wherever a name, company, address, UTR, VAT or CIS reference is needed):\n"
        + profile_block + "\n"
        "Personalise the document to this profile. Do not invent details.\n\n"
        + _signoff_instructions(req.toolId, user, bool(user.get("signature")))
    )

    inputs_text = "\n".join(f"- {k}: {v}" for k, v in req.userInputs.items() if v)
    user_msg = (
        f"Tool: {req.toolName}\n"
        f"Document reference (use this in the header): {ref_number}\n"
        f"Today's date: {today_str}\n"
        f"Review date (if applicable): {review_date_str}\n"
        f"Trade: {trade}\n"
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
    doc = {
        "id": str(uuid.uuid4()),
        "userId": user["id"],
        **p.model_dump(),
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
    return items

@api_router.delete("/cis/payments/{pid}")
async def del_cis(pid: str, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    await db.cis_payments.delete_one({"id": pid, "userId": user["id"]})
    return {"ok": True}

# ---------- Health ----------
@api_router.get("/")
async def root():
    return {"app": "Morris API", "status": "ok"}

app.include_router(api_router)

# Billing routes (Stripe checkout, trial, status) + public webhook
app.include_router(build_billing_router(db, get_user, send_subscription_receipt))
app.include_router(build_webhook_router(db, send_subscription_receipt))

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
    except Exception as e:
        logger.warning(f"Index creation: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
