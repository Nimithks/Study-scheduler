import sqlite3
import hashlib
import os
import secrets
import json
import httpx
import base64
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import FastAPI, HTTPException, status, Header, Depends, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv


# Load environment variables from local .env file if it exists
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

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
            password TEXT NOT NULL
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
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)
        # Run column migration checks for existing SQLite database
        try:
            conn.execute("ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'Medium'")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE tasks ADD COLUMN deadline TEXT")
        except Exception:
            pass
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
        conn.execute("CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON study_sessions(user_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);")
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

# ----------------- PYDANTIC SCHEMAS -----------------
class UserAuth(BaseModel):
    username: str
    password: str

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
                detail="Invalid authorization header format. Expected 'Bearer <token>'"
            )
        token = authorization.split(" ")[1]
        with db_lock:
            row = db_conn.execute("SELECT user_id FROM user_sessions WHERE token = ?", (token,)).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid session or token expired"
            )
        return row["user_id"]
    elif user_id is not None:
        return user_id
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header or user_id query parameter missing"
        )

# ----------------- AUTH ENDPOINTS -----------------
@app.post("/api/auth/register")
def register(user: UserAuth):
    # Generate 16-byte random salt
    salt = secrets.token_bytes(16)
    # Compute PBKDF2-HMAC-SHA256 hash (60,000 iterations)
    hash_bytes = hashlib.pbkdf2_hmac("sha256", user.password.encode("utf-8"), salt, 60000)
    # Base64 encode both and store as utf-8 string in salt:hash format
    salt_b64 = base64.b64encode(salt).decode("utf-8")
    hash_b64 = base64.b64encode(hash_bytes).decode("utf-8")
    stored_password = f"{salt_b64}:{hash_b64}"

    with db_lock:
        try:
            cursor = db_conn.execute(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                (user.username, stored_password)
            )
            db_conn.commit()
            return {"id": cursor.lastrowid, "username": user.username}
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="Username already exists")

@app.post("/api/auth/login")
def login(user: UserAuth):
    with db_lock:
        row = db_conn.execute(
            "SELECT id, username, password FROM users WHERE username = ?",
            (user.username,)
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
        computed_hash = hashlib.pbkdf2_hmac("sha256", user.password.encode("utf-8"), salt, 60000)
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
    
    user_id = row["id"]
    token = secrets.token_urlsafe(32)
    with db_lock:
        db_conn.execute(
            "INSERT INTO user_sessions (token, user_id) VALUES (?, ?)",
            (token, user_id)
        )
        db_conn.commit()
    return {"id": user_id, "username": row["username"], "token": token}

@app.get("/api/auth/me")
def get_me(user_id: int = Depends(get_current_user_id)):
    with db_lock:
        row = db_conn.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)

# ----------------- TASKS / TIMETABLE ENDPOINTS -----------------
@app.get("/api/tasks")
def get_tasks(user_id: int = Depends(get_current_user_id)):
    with db_lock:
        rows = db_conn.execute(
            "SELECT * FROM tasks WHERE user_id = ? ORDER BY date_str ASC, start_time ASC",
            (user_id,)
        ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/tasks", status_code=status.HTTP_201_CREATED)
def create_task(task: TaskCreate, user_id: int = Depends(get_current_user_id)):
    priority = task.priority if task.priority in ["High", "Medium", "Low"] else "Medium"
    with db_lock:
        cursor = db_conn.execute(
            """
            INSERT INTO tasks (user_id, date_str, start_time, end_time, task_name, priority, deadline, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Scheduled')
            """,
            (user_id, task.date_str, task.start_time, task.end_time, task.task_name, priority, task.deadline)
        )
        db_conn.commit()
    return {**task.dict(), "id": cursor.lastrowid, "user_id": user_id, "priority": priority, "status": "Scheduled"}

@app.put("/api/tasks/batch")
def batch_update_tasks(updates: List[TaskBatchUpdate], user_id: int = Depends(get_current_user_id)):
    if not updates:
        return {"message": "No tasks to update"}
    
    with db_lock:
        # Verify ownership of all task IDs in updates
        task_ids = [u.id for u in updates]
        placeholders = ",".join("?" for _ in task_ids)
        count = db_conn.execute(
            f"SELECT COUNT(*) FROM tasks WHERE id IN ({placeholders}) AND user_id = ?",
            (*task_ids, user_id)
        ).fetchone()[0]
        if count != len(task_ids):
            raise HTTPException(status_code=403, detail="Unauthorized to modify some or all of the requested tasks")

        db_conn.executemany(
            "UPDATE tasks SET start_time = ?, end_time = ?, status = ? WHERE id = ?",
            [(u.start_time, u.end_time, u.status, u.id) for u in updates]
        )
        db_conn.commit()
    return {"message": f"Updated {len(updates)} tasks successfully"}

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, user_id: int = Depends(get_current_user_id)):
    with db_lock:
        cursor = db_conn.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
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
            (user_id, session.task_name, session.duration, today_str)
        )
        db_conn.commit()
    return {"id": cursor.lastrowid, "message": "Study session logged successfully"}

@app.get("/api/analytics")
def get_analytics(user_id: int = Depends(get_current_user_id)):
    today_now = datetime.now()
    start_date = (today_now - timedelta(days=6)).strftime("%Y-%m-%d")
    
    with db_lock:
        # 1. Total study duration (in hours)
        total_seconds = db_conn.execute("SELECT SUM(duration) FROM study_sessions WHERE user_id = ?", (user_id,)).fetchone()[0]
        total_hours = round(total_seconds / 3600.0, 2) if total_seconds else 0.0
        
        # 2. Task stats: Completed, Scheduled, Unfinished
        status_counts = db_conn.execute("SELECT status, COUNT(*) FROM tasks WHERE user_id = ? GROUP BY status", (user_id,)).fetchall()
        stats = {"Completed": 0, "Scheduled": 0, "Unfinished": 0}
        for row in status_counts:
            stats[row[0]] = row[1]
            
        # 3. Study duration per day (Last 7 days) in a single query
        rows = db_conn.execute(
            "SELECT logged_at, SUM(duration) FROM study_sessions WHERE user_id = ? AND logged_at >= ? GROUP BY logged_at",
            (user_id, start_date)
        ).fetchall()
        duration_map = {r[0]: r[1] for r in rows}
    
    chart_data = []
    for i in range(6, -1, -1):
        dt = today_now - timedelta(days=i)
        day_date = dt.strftime("%Y-%m-%d")
        duration = duration_map.get(day_date, 0)
        chart_data.append({
            "date": day_date,
            "day": dt.strftime("%a"),
            "minutes": round((duration or 0) / 60.0, 1)
        })
        
    return {
        "total_study_hours": total_hours,
        "completed_tasks": stats["Completed"],
        "scheduled_tasks": stats["Scheduled"],
        "unfinished_tasks": stats["Unfinished"],
        "chart_data": chart_data
    }



# Serve static frontend files (prefers production dist build if generated, otherwise frontend directory)
frontend_dist_dir = BASE_DIR.parent / "frontend" / "dist"
frontend_static_dir = frontend_dist_dir if frontend_dist_dir.exists() else (BASE_DIR.parent / "frontend")
app.mount("/", StaticFiles(directory=frontend_static_dir, html=True), name="frontend")

