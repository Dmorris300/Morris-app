from fastapi import FastAPI, APIRouter, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import secrets
import uuid
import bcrypt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage
from email_helper import send_password_reset, send_welcome, send_subscription_receipt
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
    utr: Optional[str] = None
    vatNumber: Optional[str] = None
    cisStatus: Optional[str] = None
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

class DocumentSave(BaseModel):
    title: str
    toolId: str
    content: str
    refNumber: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class CISPayment(BaseModel):
    date: str
    contractor: str
    gross: float
    deduction: float
    net: float
    notes: Optional[str] = ""

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


# ---------- Auth ----------
@api_router.post("/auth/signup")
async def signup(req: SignupReq):
    email_lower = req.email.lower()
    if await db.users.find_one({"username": req.username.lower()}, {"_id": 0}):
        raise HTTPException(400, "Username already exists")
    if await db.users.find_one({"email": email_lower}, {"_id": 0}):
        raise HTTPException(400, "Email already registered")
    otp = f"{random.randint(100000, 999999)}"
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
    # Fire-and-forget welcome email (won't block signup if Resend is unreachable)
    try:
        await send_welcome(email_lower, req.username)
    except Exception as e:
        logger.warning(f"Welcome email failed: {e}")
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
    code = f"{random.randint(100000, 999999)}"
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
@api_router.post("/generate")
async def generate(req: GenerateReq, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)

    # Tier-gate: free users get FREE_TOOL_LIMIT distinct tools / FREE_DOC_LIMIT docs per month
    await check_can_generate(db, user, req.toolId)

    trade = req.trade or user.get("trade") or "tradesperson"
    company = req.companyName or user.get("companyName") or "[Your Company]"
    full_name = req.fullName or user.get("fullName") or user.get("username")

    ref_number = await next_ref_number(user, req.toolId)
    today_str = datetime.now(timezone.utc).strftime("%d %B %Y")
    review_date_str = (datetime.now(timezone.utc) + timedelta(days=365)).strftime("%d %B %Y")

    system_prompt = (
        "You are Morris, an AI document writer for UK construction tradespeople. "
        "Always write in UK English. Reference UK construction law and practice where relevant, "
        "including the Construction Industry Scheme (CIS), HMRC, HSE, CDM 2015 regulations, "
        "and the Housing Grants, Construction and Regeneration Act 1996 (as amended). "
        "Output professional, plain English documents — clear, firm, polite and well-structured. "
        "Never use markdown headings (#) or asterisks; use clean text, paragraph breaks, and capitalised section labels (e.g. 'SUBJECT:', 'TO:'). "
        "STRICT FORMATTING RULE: Do not use dashes, hyphens, em-dashes, en-dashes or any similar punctuation anywhere in the output unless the user has typed them in themselves as part of their own input. Use clean spacing, line breaks and capitalised section labels instead. "
        "STRICT PLACEHOLDER RULE: Never output placeholder text such as '[Your Company]', '[Insert Date]', 'TBC' or anything in square brackets. If you do not have a value, use the value supplied in the user details below, leave it out entirely, or use the auto-populated profile data provided. "
        "DOCUMENT HEADER RULE: Every document MUST begin with a header block in this exact format:\n"
        "DOCUMENT REFERENCE: {ref}\n"
        "DATE: {today}\n"
        "If this is a compliance, RAMS, COSHH, H&S or assessment document also include:\n"
        "REVIEW DATE: {review}\n"
        "Then a blank line and the document body.\n"
        .format(ref=ref_number, today=today_str, review=review_date_str)
        + f"The user is a UK {trade}. Their company is '{company}'. Their name is '{full_name}'. "
        "Personalise the document to their trade and details. Do not include placeholder bracketed fields unless asked."
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
