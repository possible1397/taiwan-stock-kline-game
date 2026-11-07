"""
用戶認證 Router（MVP 版）
登入、註冊、取得自身資料
"""
import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database import get_db
from models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", "30"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ─────────────────────────────────────────
# 工具函式
# ─────────────────────────────────────────
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        return db.query(User).filter(User.id == user_id).first()
    except (JWTError, ValueError, TypeError):
        return None


# ─────────────────────────────────────────
# Pydantic Schema
# ─────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    is_premium: bool


class UserProfileResponse(BaseModel):
    id: int
    email: str
    username: str
    is_premium: bool
    capital: float
    total_rounds: int
    total_wins: int
    current_streak: int
    max_streak: int
    experience: int
    level: int


# ─────────────────────────────────────────
# POST /api/auth/register  —  註冊
# ─────────────────────────────────────────
@router.post("/register", response_model=LoginResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="此 Email 已被使用")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="此用戶名已被使用")

    user = User(
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return LoginResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        is_premium=user.is_premium,
    )


# ─────────────────────────────────────────
# POST /api/auth/login  —  登入
# ─────────────────────────────────────────
@router.post("/login", response_model=LoginResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email 或密碼錯誤",
        )

    token = create_access_token(user.id)
    return LoginResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        is_premium=user.is_premium,
    )


# ─────────────────────────────────────────
# GET /api/auth/me  —  取得目前用戶資料
# ─────────────────────────────────────────
@router.get("/me", response_model=UserProfileResponse)
def get_me(current_user: Optional[User] = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="請先登入")
    return UserProfileResponse(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        is_premium=current_user.is_premium,
        capital=current_user.capital,
        total_rounds=current_user.total_rounds,
        total_wins=current_user.total_wins,
        current_streak=current_user.current_streak,
        max_streak=current_user.max_streak,
        experience=current_user.experience,
        level=current_user.level,
    )
