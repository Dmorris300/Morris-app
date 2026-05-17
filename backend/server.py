from fastapi import FastAPI, APIRouter, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import uuid
import bcrypt
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage

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
    password: str
    phone: str

class VerifyOtpReq(BaseModel):
    username: str
    otp: str

class LoginReq(BaseModel):
    username: str
    password: str

class ProfileUpdate(BaseModel):
    trade: Optional[str] = None
    companyName: Optional[str] = None
    fullName: Optional[str] = None
    address: Optional[str] = None
    utr: Optional[str] = None
    vatNumber: Optional[str] = None
    cisStatus: Optional[str] = None
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
    return user

# ---------- Auth ----------
@api_router.post("/auth/signup")
async def signup(req: SignupReq):
    existing = await db.users.find_one({"username": req.username.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(400, "Username already exists")
    otp = f"{random.randint(100000, 999999)}"
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "username": req.username.lower(),
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
    # Return OTP in response (demo mode — real app would SMS this)
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
    user = await db.users.find_one({"username": req.username.lower()}, {"_id": 0})
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

@api_router.post("/profile/update")
async def update_profile(update: ProfileUpdate, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)
    patch = {k: v for k, v in update.model_dump().items() if v is not None}
    if patch:
        await db.users.update_one({"id": user["id"]}, {"$set": patch})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0, "otp": 0})
    return updated

# ---------- Claude generate ----------
@api_router.post("/generate")
async def generate(req: GenerateReq, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user(token)

    trade = req.trade or user.get("trade") or "tradesperson"
    company = req.companyName or user.get("companyName") or "[Your Company]"
    full_name = req.fullName or user.get("fullName") or user.get("username")

    system_prompt = (
        "You are Morris, an AI document writer for UK construction tradespeople. "
        "Always write in UK English. Reference UK construction law and practice where relevant, "
        "including the Construction Industry Scheme (CIS), HMRC, HSE, CDM 2015 regulations, "
        "and the Housing Grants, Construction and Regeneration Act 1996 (as amended). "
        "Output professional, plain English documents — clear, firm, polite and well-structured. "
        "Never use markdown headings (#) or asterisks; use clean text, paragraph breaks, and capitalised section labels (e.g. 'SUBJECT:', 'TO:'). "
        f"The user is a UK {trade}. Their company is '{company}'. Their name is '{full_name}'. "
        "Personalise the document to their trade and details. Do not include placeholder bracketed fields unless asked."
    )

    inputs_text = "\n".join(f"- {k}: {v}" for k, v in req.userInputs.items() if v)
    user_msg = (
        f"Tool: {req.toolName}\n"
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
        return {"ok": True, "content": response}
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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
