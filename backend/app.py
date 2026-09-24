import sqlite3
import hashlib
import os
import secrets
import json
import httpx
import base64
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import FastAPI, HTTPException, status, Header, Depends, Request
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
from cryptography.fernet import Fernet, InvalidToken

from mailer import send_verification_email, send_task_alert_email

# Load environment variables from local .env file if it exists
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

email_encryption_key = os.getenv("EMAIL_ENCRYPTION_KEY")
if not email_encryption_key:
    raise RuntimeError(
        "EMAIL_ENCRYPTION_KEY must be configured to protect stored email addresses"
    )
try:
    email_cipher = Fernet(email_encryption_key.encode("utf-8"))
except (ValueError, TypeError) as exc:
    raise RuntimeError("EMAIL_ENCRYPTION_KEY must be a valid Fernet key") from exc


def encrypt_email(email: str) -> str:
    return email_cipher.encrypt(email.encode("utf-8")).decode("utf-8")


def decrypt_email(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    try:
        return email_cipher.decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return value


def get_frontend_url():
    return os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


import threading

DATABASE_FILE = BASE_DIR / "study_companion.db"
db_lock = threading.Lock()


def get_db_connection():
    conn = sqlite3.connect(DATABASE_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


db_conn = get_db_connection()


def get_db():
    return db_conn


def init_db(conn):
    with db_lock:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT,
            email_verified INTEGER DEFAULT 0,
            email_verification_token TEXT
        );
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS user_sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date_str TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            task_name TEXT NOT NULL,
            priority TEXT DEFAULT 'Medium',
            deadline TEXT,
            status TEXT DEFAULT 'Scheduled',
            reminded_5m INTEGER DEFAULT 0,
            reminded_start INTEGER DEFAULT 0,
            snooze_token TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS study_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            task_name TEXT NOT NULL,
            duration INTEGER NOT NULL,
            logged_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)
        # Create indexes to avoid full table scans and improve query latency
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_snooze_token ON tasks(snooze_token);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_users_verif_token ON users(email_verification_token);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON study_sessions(user_id);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);"
        )

        conn.commit()


init_db(db_conn)

app = FastAPI(title="Smart Study Scheduler & Tracker API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def check_and_send_task_reminders():
    """
    Checks for upcoming and starting tasks for users with verified emails,
    sending 5-min pre-alerts and starting-now alerts with 1-click snooze links.
    """
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    current_minutes = now.hour * 60 + now.minute

    with db_lock:
        rows = db_conn.execute(
            """
            SELECT 
                t.id, t.user_id, t.task_name, t.start_time, t.end_time, t.priority,
                t.reminded_5m, t.reminded_start, t.snooze_token,
                u.username, u.email
            FROM tasks t
            JOIN users u ON t.user_id = u.id
            WHERE t.date_str = ?
              AND t.status = 'Scheduled'
              AND u.email_verified = 1
              AND u.email IS NOT NULL
              AND u.email != ''
        """,
            (today_str,),
        ).fetchall()

    for r in rows:
        task_id = r["id"]
        start_time_str = r["start_time"]
        start_mins = timestr_to_minutes(start_time_str)
        reminded_5m = bool(r["reminded_5m"])
        reminded_start = bool(r["reminded_start"])
        email = decrypt_email(r["email"])
        username = r["username"]
        snooze_token = r["snooze_token"]
        if not snooze_token:
            snooze_token = secrets.token_urlsafe(24)
            with db_lock:
                db_conn.execute(
                    "UPDATE tasks SET snooze_token = ? WHERE id = ?",
                    (snooze_token, task_id),
                )
                db_conn.commit()

        task_dict = {
            "task_name": r["task_name"],
            "start_time": r["start_time"],
            "end_time": r["end_time"],
            "priority": r["priority"],
            "snooze_token": snooze_token,
        }

        diff_minutes = start_mins - current_minutes

        # 1. 5-minute pre-alert (within 1 to 5 minutes before start)
        if 0 < diff_minutes <= 5 and not reminded_5m:
            send_task_alert_email(email, username, task_dict, is_starting=False)
            with db_lock:
                db_conn.execute(
                    "UPDATE tasks SET reminded_5m = 1 WHERE id = ?", (task_id,)
                )
                db_conn.commit()

        # 2. Starting-now alert (within 0 to -15 minutes past start)
        elif -15 <= diff_minutes <= 0 and not reminded_start:
            send_task_alert_email(email, username, task_dict, is_starting=True)
            with db_lock:
                db_conn.execute(
                    "UPDATE tasks SET reminded_start = 1 WHERE id = ?", (task_id,)
                )
                db_conn.commit()


async def task_reminder_worker():
    while True:
        try:
            check_and_send_task_reminders()
        except Exception as e:
            print(f"⚠️ Exception in background task reminder worker: {e}")
        await asyncio.sleep(30)


@app.on_event("startup")
async def on_startup():
    asyncio.create_task(task_reminder_worker())


# ----------------- PYDANTIC SCHEMAS -----------------
class UserAuth(BaseModel):
    username: str
    password: str
    email: Optional[str] = None


class EmailUpdate(BaseModel):
    email: str


class TaskCreate(BaseModel):
    date_str: str
    start_time: str
    end_time: str
    task_name: str
    priority: str = "Medium"
    deadline: Optional[str] = None


class TaskBatchUpdate(BaseModel):
    id: int
    start_time: str
    end_time: str
    status: str


class SessionLog(BaseModel):
    task_name: str
    duration: int  # in seconds


def get_current_user_id(authorization: str = Header(None), user_id: int = None) -> int:
    if authorization:
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authorization header format. Expected 'Bearer <token>'",
            )
        token = authorization.split(" ")[1]
        with db_lock:
            row = db_conn.execute(
                "SELECT user_id FROM user_sessions WHERE token = ?", (token,)
            ).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid session or token expired",
            )
        return row["user_id"]
    elif user_id is not None:
        return user_id
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header or user_id query parameter missing",
        )
    
@app.post("/api/auth/register")
def register(user: UserAuth):
    # Generate 16-byte random salt
    salt = secrets.token_bytes(16)
    # Compute PBKDF2-HMAC-SHA256 hash (60,000 iterations)
    hash_bytes = hashlib.pbkdf2_hmac(
        "sha256", user.password.encode("utf-8"), salt, 60000
    )
    # Base64 encode both and store as utf-8 string in salt:hash format
    salt_b64 = base64.b64encode(salt).decode("utf-8")
    hash_b64 = base64.b64encode(hash_bytes).decode("utf-8")
    stored_password = f"{salt_b64}:{hash_b64}"

    clean_email = (
        user.email.strip().lower() if user.email and user.email.strip() else None
    )
    email_token = secrets.token_urlsafe(32) if clean_email else None

    with db_lock:
        try:
            cursor = db_conn.execute(
                "INSERT INTO users (username, password, email, email_verified, email_verification_token) VALUES (?, ?, ?, 0, ?)",
                (
                    user.username,
                    stored_password,
                    encrypt_email(clean_email) if clean_email else None,
                    email_token,
                ),
            )
            db_conn.commit()
            new_id = cursor.lastrowid
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="Username already exists")

    if clean_email and email_token:
        try:
            send_verification_email(clean_email, user.username, email_token)
        except Exception as e:
            print(f"Failed to dispatch verification email on register: {e}")

    return {
        "id": new_id,
        "username": user.username,
        "email": clean_email,
        "email_verified": False,
        "message": "Account created successfully"
        + ("! Verification email sent." if clean_email else "."),
    }


@app.post("/api/auth/login")
def login(user: UserAuth):
    with db_lock:
        row = db_conn.execute(
            "SELECT id, username, password, email, email_verified FROM users WHERE username = ?",
            (user.username,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    stored_password_str = row["password"]
    is_valid = False

    # Try PBKDF2 verification
    try:
        salt_b64, stored_hash_b64 = stored_password_str.split(":", 1)
        salt = base64.b64decode(salt_b64.encode("utf-8"))
        stored_hash = base64.b64decode(stored_hash_b64.encode("utf-8"))
        computed_hash = hashlib.pbkdf2_hmac(
            "sha256", user.password.encode("utf-8"), salt, 60000
        )
        is_valid = secrets.compare_digest(stored_hash, computed_hash)
    except Exception:
        is_valid = False

    # Fallback to legacy SHA-256 for existing users
    if not is_valid:
        legacy_hash = hashlib.sha256(user.password.encode()).hexdigest()
        if secrets.compare_digest(stored_password_str, legacy_hash):
            is_valid = True

    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Enforce email verification if an email is registered
    email = decrypt_email(row["email"])
    if email and not bool(row["email_verified"]):
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before logging in! Check your inbox or spam folder for the confirmation link.",
        )

    user_id = row["id"]
    token = secrets.token_urlsafe(32)
    with db_lock:
        db_conn.execute(
            "INSERT INTO user_sessions (token, user_id) VALUES (?, ?)", (token, user_id)
        )
        db_conn.commit()
    return {
        "id": user_id,
        "username": row["username"],
        "email": email,
        "email_verified": bool(row["email_verified"]),
        "token": token,
    }


@app.get("/api/auth/me")
def get_me(user_id: int = Depends(get_current_user_id)):
    with db_lock:
        row = db_conn.execute(
            "SELECT id, username, email, email_verified FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    data = dict(row)
    data["email"] = decrypt_email(data.get("email"))
    data["email_verified"] = bool(data.get("email_verified", 0))
    return data


@app.post("/api/user/email")
def update_user_email(
    payload: EmailUpdate, user_id: int = Depends(get_current_user_id)
):
    clean_email = payload.email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(
            status_code=400, detail="Please provide a valid email address."
        )

    token = secrets.token_urlsafe(32)
    with db_lock:
        row = db_conn.execute(
            "SELECT username FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        username = row["username"]

        db_conn.execute(
            "UPDATE users SET email = ?, email_verified = 0, email_verification_token = ? WHERE id = ?",
            (encrypt_email(clean_email), token, user_id),
        )
        db_conn.commit()

    send_verification_email(clean_email, username, token)
    return {
        "message": "Email updated! Verification email sent.",
        "email": clean_email,
        "email_verified": False,
    }

#for logged-in users to resend verification email if they haven't verified yet
@app.post("/api/user/resend-verification")
def resend_verification(user_id: int = Depends(get_current_user_id)):
    with db_lock:
        row = db_conn.execute(
            "SELECT username, email, email_verified, email_verification_token FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        email = decrypt_email(row["email"])
        if not email:
            raise HTTPException(
                status_code=400, detail="No email configured for this account."
            )
        if row["email_verified"]:
            return {"message": "Email is already verified!"}

        token = row["email_verification_token"]
        if not token:
            token = secrets.token_urlsafe(32)
            db_conn.execute(
                "UPDATE users SET email_verification_token = ? WHERE id = ?",
                (token, user_id),
            )
            db_conn.commit()

    send_verification_email(email, row["username"], token)
    return {"message": "Verification email resent successfully!"}


class PublicResendPayload(BaseModel):
    username: str

# ----------------- PUBLIC AUTH ENDPOINTS ----------------- for users who are not logged in
@app.post("/api/auth/resend-verification")
def public_resend_verification(payload: PublicResendPayload):
    with db_lock:
        row = db_conn.execute(
            "SELECT username, email, email_verified, email_verification_token FROM users WHERE username = ?",
            (payload.username.strip(),),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Username not found.")
        email = decrypt_email(row["email"])
        if not email:
            raise HTTPException(
                status_code=400, detail="No email configured for this account."
            )
        if bool(row["email_verified"]):
            return {"message": "Email is already verified! Please log in."}

        token = row["email_verification_token"]
        if not token:
            token = secrets.token_urlsafe(32)
            db_conn.execute(
                "UPDATE users SET email_verification_token = ? WHERE username = ?",
                (token, payload.username.strip()),
            )
            db_conn.commit()

    send_verification_email(email, row["username"], token)
    return {
        "message": f"Verification email sent to {email}! Please check inbox and spam folder."
    }


@app.get("/api/auth/verify-email", response_class=HTMLResponse)
def verify_email(token: str):
    if not token or len(token) < 10:
        return HTMLResponse(
            status_code=400,
            content="""
            <html><body style="font-family: sans-serif; text-align: center; padding: 50px; background: #f8fafc;">
            <div style="max-width: 480px; margin: auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              <h2 style="color: #ef4444;">❌ Invalid Verification Link</h2>
              <p>This verification link is invalid or has expired.</p>
            </div></body></html>
            """,
        )

    with db_lock:
        row = db_conn.execute(
            "SELECT id, username, email FROM users WHERE email_verification_token = ?",
            (token,),
        ).fetchone()
        if not row:
            return HTMLResponse(
                status_code=404,
                content="""
                <html><body style="font-family: sans-serif; text-align: center; padding: 50px; background: #f8fafc;">
                <div style="max-width: 480px; margin: auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                  <h2 style="color: #ef4444;">❌ Token Expired or Already Verified</h2>
                  <p>This link is no longer valid. Your email may already be verified.</p>
                </div></body></html>
                """,
            )

        db_conn.execute(
            "UPDATE users SET email_verified = 1, email_verification_token = NULL WHERE id = ?",
            (row["id"],),
        )
        db_conn.commit()

    verified_email = decrypt_email(row["email"])

    return HTMLResponse(content=f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Email Verified - Smart Study Scheduler</title>
          <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
            .card {{ background: #ffffff; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); text-align: center; max-width: 440px; border: 1px solid #e2e8f0; }}
            .icon {{ font-size: 56px; margin-bottom: 16px; }}
            h1 {{ font-size: 24px; color: #0f172a; margin: 0 0 12px 0; }}
            p {{ color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; }}
            .btn {{ display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; }}
            .btn:hover {{ background: #4338ca; }}
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✅</div>
            <h1>Email Successfully Verified!</h1>
            <p>Welcome, <strong>{row['username']}</strong>! Your email (<code>{verified_email}</code>) is now confirmed. You will receive automated 5-minute pre-alerts and task starting alerts with 1-click snooze links.</p>
            <a href="/" class="btn">Go to Study Scheduler</a>
          </div>
        </body>
        </html>
        """)


# ----------------- TASKS / TIMETABLE ENDPOINTS -----------------
@app.get("/api/tasks")
def get_tasks(user_id: int = Depends(get_current_user_id)):
    with db_lock:
        rows = db_conn.execute(
            "SELECT * FROM tasks WHERE user_id = ? ORDER BY date_str ASC, start_time ASC",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def timestr_to_minutes(time_str: str) -> int:
    try:
        parts = time_str.strip().split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return 0


def minutes_to_timestr(total_mins: int) -> str:
    total_mins = total_mins % 1440
    hours = total_mins // 60
    mins = total_mins % 60
    return f"{hours:02d}:{mins:02d}"


@app.post("/api/tasks", status_code=status.HTTP_201_CREATED)
def create_task(task: TaskCreate, user_id: int = Depends(get_current_user_id)):
    priority = task.priority if task.priority in ["High", "Medium", "Low"] else "Medium"
    snooze_token = secrets.token_urlsafe(24)
    with db_lock:
        cursor = db_conn.execute(
            """
            INSERT INTO tasks (user_id, date_str, start_time, end_time, task_name, priority, deadline, status, reminded_5m, reminded_start, snooze_token)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Scheduled', 0, 0, ?)
            """,
            (
                user_id,
                task.date_str,
                task.start_time,
                task.end_time,
                task.task_name,
                priority,
                task.deadline,
                snooze_token,
            ),
        )
        db_conn.commit()
    return {
        **task.dict(),
        "id": cursor.lastrowid,
        "user_id": user_id,
        "priority": priority,
        "status": "Scheduled",
        "snooze_token": snooze_token,
    }


# ----------------- 1-CLICK EMAIL ACTION ENDPOINTS -----------------
@app.get("/api/tasks/snooze", response_class=HTMLResponse)
def snooze_task_from_email(token: str, mins: int = 15):
    if not token or len(token) < 10:
        return HTMLResponse(
            status_code=400,
            content="""
            <html><body style="font-family: sans-serif; text-align: center; padding: 50px; background: #f8fafc;">
            <div style="max-width: 480px; margin: auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              <h2 style="color: #ef4444;">❌ Invalid Snooze Link</h2>
              <p>The snooze link provided is invalid.</p>
            </div></body></html>
            """,
        )

    mins = max(5, min(mins, 180))  # Allow snoozing between 5 to 180 minutes

    with db_lock:
        task = db_conn.execute(
            "SELECT * FROM tasks WHERE snooze_token = ?", (token,)
        ).fetchone()
        if not task:
            return HTMLResponse(
                status_code=404,
                content="""
                <html><body style="font-family: sans-serif; text-align: center; padding: 50px; background: #f8fafc;">
                <div style="max-width: 480px; margin: auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                  <h2 style="color: #ef4444;">❌ Task Not Found</h2>
                  <p>This task may have been removed or already modified.</p>
                </div></body></html>
                """,
            )

        old_start = task["start_time"]
        old_end = task["end_time"]
        start_mins = timestr_to_minutes(old_start) + mins
        end_mins = timestr_to_minutes(old_end) + mins

        new_start = minutes_to_timestr(start_mins)
        new_end = minutes_to_timestr(end_mins)

        # Reset reminder flags so the user gets notified for the new snoozed time!
        db_conn.execute(
            """
            UPDATE tasks 
            SET start_time = ?, end_time = ?, reminded_5m = 0, reminded_start = 0 
            WHERE id = ?
            """,
            (new_start, new_end, task["id"]),
        )
        db_conn.commit()

    return HTMLResponse(content=f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Task Rescheduled - Smart Study Scheduler</title>
          <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }}
            .card {{ background: #ffffff; padding: 36px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); text-align: center; max-width: 460px; width: 100%; border: 1px solid #e2e8f0; }}
            .icon {{ font-size: 50px; margin-bottom: 12px; }}
            h1 {{ font-size: 22px; color: #0f172a; margin: 0 0 12px 0; }}
            p {{ color: #475569; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0; }}
            .time-box {{ background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; margin: 16px 0; }}
            .time-row {{ display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; }}
            .time-row strong {{ color: #1e293b; }}
            .badge-success {{ display: inline-block; background-color: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 10px; }}
            .btn {{ display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 20px; }}
            .btn:hover {{ background: #4338ca; }}
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">⏰</div>
            <h1>Task Rescheduled!</h1>
            <p><strong>{task['task_name']}</strong> has been snoozed by <strong>{mins} minutes</strong>.</p>
            
            <div class="time-box">
              <div class="time-row"><span>Previous Time:</span> <span>{old_start} - {old_end}</span></div>
              <div class="time-row"><span>New Time:</span> <strong>{new_start} - {new_end}</strong></div>
            </div>

            <div class="badge-success">🔔 Email alerts re-armed for the new schedule!</div>

            <div>
              <a href="/" class="btn">View Study Dashboard</a>
            </div>
          </div>
        </body>
        </html>
        """)


@app.get("/api/tasks/complete-from-email", response_class=HTMLResponse)
def complete_task_from_email(token: str):
    if not token or len(token) < 10:
        return HTMLResponse(status_code=400, content="Invalid link")

    with db_lock:
        task = db_conn.execute(
            "SELECT * FROM tasks WHERE snooze_token = ?", (token,)
        ).fetchone()
        if not task:
            return HTMLResponse(status_code=404, content="Task not found")

        db_conn.execute(
            "UPDATE tasks SET status = 'Completed' WHERE id = ?", (task["id"],)
        )
        db_conn.commit()

    return HTMLResponse(content=f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Task Completed - Smart Study Scheduler</title>
          <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
            .card {{ background: #ffffff; padding: 36px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); text-align: center; max-width: 440px; border: 1px solid #e2e8f0; }}
            .icon {{ font-size: 50px; margin-bottom: 12px; }}
            h1 {{ font-size: 22px; color: #0f172a; margin: 0 0 12px 0; }}
            p {{ color: #475569; font-size: 15px; margin: 0 0 20px 0; }}
            .btn {{ display: inline-block; background: #10b981; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; }}
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">🎉</div>
            <h1>Great Job!</h1>
            <p><strong>{task['task_name']}</strong> has been marked as <strong>Completed</strong>.</p>
            <a href="/" class="btn">Back to App</a>
          </div>
        </body>
        </html>
        """)


@app.put("/api/tasks/batch")
def batch_update_tasks(
    updates: List[TaskBatchUpdate], user_id: int = Depends(get_current_user_id)
):
    if not updates:
        return {"message": "No tasks to update"}

    with db_lock:
        # Verify ownership of all task IDs in updates
        task_ids = [u.id for u in updates]
        placeholders = ",".join("?" for _ in task_ids)
        count = db_conn.execute(
            f"SELECT COUNT(*) FROM tasks WHERE id IN ({placeholders}) AND user_id = ?",
            (*task_ids, user_id),
        ).fetchone()[0]
        if count != len(task_ids):
            raise HTTPException(
                status_code=403,
                detail="Unauthorized to modify some or all of the requested tasks",
            )

        db_conn.executemany(
            "UPDATE tasks SET start_time = ?, end_time = ?, status = ? WHERE id = ?",
            [(u.start_time, u.end_time, u.status, u.id) for u in updates],
        )
        db_conn.commit()
    return {"message": f"Updated {len(updates)} tasks successfully"}


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, user_id: int = Depends(get_current_user_id)):
    with db_lock:
        cursor = db_conn.execute(
            "DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id)
        )
        db_conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Task not found or unauthorized")
    return {"message": "Task deleted successfully"}


# ----------------- TRACKER ENDPOINTS -----------------
@app.post("/api/sessions", status_code=status.HTTP_201_CREATED)
def log_session(session: SessionLog, user_id: int = Depends(get_current_user_id)):
    today_str = datetime.now().strftime("%Y-%m-%d")
    with db_lock:
        cursor = db_conn.execute(
            """
            INSERT INTO study_sessions (user_id, task_name, duration, logged_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, session.task_name, session.duration, today_str),
        )
        db_conn.commit()
    return {"id": cursor.lastrowid, "message": "Study session logged successfully"}


@app.get("/api/analytics")
def get_analytics(user_id: int = Depends(get_current_user_id)):
    today_now = datetime.now()
    start_date = (today_now - timedelta(days=6)).strftime("%Y-%m-%d")

    with db_lock:
        # 1. Total study duration (in hours)
        total_seconds = db_conn.execute(
            "SELECT SUM(duration) FROM study_sessions WHERE user_id = ?", (user_id,)
        ).fetchone()[0]
        total_hours = round(total_seconds / 3600.0, 2) if total_seconds else 0.0

        # 2. Task stats: Completed, Scheduled, Unfinished
        status_counts = db_conn.execute(
            "SELECT status, COUNT(*) FROM tasks WHERE user_id = ? GROUP BY status",
            (user_id,),
        ).fetchall()
        stats = {"Completed": 0, "Scheduled": 0, "Unfinished": 0}
        for row in status_counts:
            stats[row[0]] = row[1]

        # 3. Study duration per day (Last 7 days) in a single query
        rows = db_conn.execute(
            "SELECT logged_at, SUM(duration) FROM study_sessions WHERE user_id = ? AND logged_at >= ? GROUP BY logged_at",
            (user_id, start_date),
        ).fetchall()
        duration_map = {r[0]: r[1] for r in rows}

    chart_data = []
    for i in range(6, -1, -1):
        dt = today_now - timedelta(days=i)
        day_date = dt.strftime("%Y-%m-%d")
        duration = duration_map.get(day_date, 0)
        chart_data.append(
            {
                "date": day_date,
                "day": dt.strftime("%a"),
                "minutes": round((duration or 0) / 60.0, 1),
            }
        )

    return {
        "total_study_hours": total_hours,
        "completed_tasks": stats["Completed"],
        "scheduled_tasks": stats["Scheduled"],
        "unfinished_tasks": stats["Unfinished"],
        "chart_data": chart_data,
    }


# Serve static frontend files (prefers production dist build if generated, otherwise frontend directory)
frontend_dist_dir = BASE_DIR.parent / "frontend" / "dist"
frontend_static_dir = (
    frontend_dist_dir if frontend_dist_dir.exists() else (BASE_DIR.parent / "frontend")
)
app.mount("/", StaticFiles(directory=frontend_static_dir, html=True), name="frontend")
