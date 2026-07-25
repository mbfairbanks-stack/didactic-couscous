from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func, distinct, text, nullslast
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import Optional, List
import datetime
import hashlib
import tempfile, os, io, json, csv, re, math
from collections import defaultdict

from dotenv import load_dotenv
load_dotenv()

import models, database
from database import engine, get_db, run_migrations, DEMO_MODE, set_current_db_path
from importer import import_xlsx
import user_auth

models.Base.metadata.create_all(bind=engine)
run_migrations()

BUDGET_PASSWORD = os.getenv("BUDGET_PASSWORD", "")
MULTI_USER = os.getenv("MULTI_USER", "true").lower() not in ("0", "false", "no")

# Seed built-in users (demo + admin) on startup
if MULTI_USER:
    user_auth.seed_default_users(admin_password=BUDGET_PASSWORD)

app = FastAPI(title="BudgetBot API")

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_PUBLIC_PATHS = {"/auth/login", "/auth/register", "/auth/check"}


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    if MULTI_USER:
        # Allow login/register without a token
        if request.url.path in _PUBLIC_PATHS:
            return await call_next(request)

        token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        user = user_auth.get_user_from_token(token) if token else None
        if not user:
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

        username, is_demo = user
        # Demo users cannot write data
        if is_demo and request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return JSONResponse(
                status_code=403,
                content={"detail": "Demo mode is read-only. Create your own account to get started!"},
            )
        # Route this request to the correct user DB
        db_path = user_auth.get_user_db_path(username, is_demo)
        set_current_db_path(db_path)
        request.state.db_path = db_path
        request.state.username = username
        request.state.is_demo = is_demo
        return await call_next(request)

    # ── Legacy single-password mode (local dev / old deployments) ──
    if not BUDGET_PASSWORD:
        if DEMO_MODE and request.method in ("POST", "PUT", "PATCH", "DELETE"):
            if request.url.path not in _PUBLIC_PATHS:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Demo mode is read-only."},
                )
        return await call_next(request)

    if request.url.path in _PUBLIC_PATHS:
        return await call_next(request)

    pw_hash = hashlib.sha256(BUDGET_PASSWORD.encode()).hexdigest()
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if token != pw_hash:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: Optional[str] = None
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str


@app.post("/auth/register")
@limiter.limit("5/minute")
async def auth_register(request: Request, body: RegisterRequest):
    if not MULTI_USER:
        raise HTTPException(status_code=404)
    if len(body.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    try:
        token = user_auth.register(body.username, body.password)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"token": token, "demo": False}


@app.post("/auth/login")
@limiter.limit("10/minute")
async def auth_login(request: Request, body: LoginRequest):
    if MULTI_USER:
        username = (body.username or "").strip()
        if not username:
            raise HTTPException(status_code=400, detail="Username is required")
        try:
            token, is_demo = user_auth.authenticate(username, body.password)
        except ValueError:
            raise HTTPException(status_code=401, detail="Incorrect username or password")
        return {"token": token, "demo": is_demo}

    # Legacy single-password mode
    if not BUDGET_PASSWORD:
        return {"token": ""}
    pw_hash = hashlib.sha256(BUDGET_PASSWORD.encode()).hexdigest()
    if hashlib.sha256(body.password.encode()).hexdigest() != pw_hash:
        raise HTTPException(status_code=401, detail="Incorrect password")
    return {"token": pw_hash, "demo": DEMO_MODE}


@app.get("/auth/check")
def auth_check(request: Request):
    """Returns ok:true only if the token is valid."""
    if MULTI_USER:
        token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        user = user_auth.get_user_from_token(token) if token else None
        if not user:
            return {"ok": False, "demo": False}
        _, is_demo = user
        return {"ok": True, "demo": is_demo}
    is_demo = getattr(request.state, "is_demo", DEMO_MODE)
    return {"ok": True, "demo": is_demo}

# ---------------------------------------------------------------------------
# Domain routers
# ---------------------------------------------------------------------------

from routers import (
    transactions,
    income,
    budget,
    summaries,
    meta,
    debts,
    networth,
    importing,
    insights,
    retirement,
)

for _r in (transactions, income, budget, summaries, meta, debts,
           networth, importing, insights, retirement):
    app.include_router(_r.router)
