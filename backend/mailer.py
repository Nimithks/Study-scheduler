import os
import smtplib
from pathlib import Path
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional
from dotenv import load_dotenv

# Ensure .env in backend directory is loaded
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

def get_smtp_host():
    return os.getenv("SMTP_HOST", "smtp.gmail.com").strip()

def get_smtp_port():
    try:
        return int(os.getenv("SMTP_PORT", "587").strip())
    except Exception:
        return 587

def get_smtp_user():
    return os.getenv("SMTP_USER", "").strip()

def get_smtp_password():
    # Google app passwords can sometimes be copied with spaces like "xxxx xxxx xxxx xxxx"
    return os.getenv("SMTP_PASSWORD", "").replace(" ", "").strip()

def get_app_base_url():
    return os.getenv("APP_BASE_URL", "http://localhost:8000").rstrip("/")

def is_smtp_configured() -> bool:
    user = get_smtp_user()
    pw = get_smtp_password()
    return bool(user and pw)

def send_email(to_email: str, subject: str, html_content: str, text_content: Optional[str] = None):
    """
    Sends an HTML email via SMTP (e.g. Gmail).
    If SMTP credentials are not configured in .env, prints a formatted preview to the console.
    """
    if not is_smtp_configured():
        print("\n" + "="*70)
        print(f"📧 [DEV EMAIL LOGGER] (SMTP not configured in .env)")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print("-" * 70)
        print(text_content or html_content)
        print("="*70 + "\n")
        return True

    try:
        user = get_smtp_user()
        password = get_smtp_password()
        host = get_smtp_host()
        port = get_smtp_port()

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"Smart Study Scheduler <{user}>"
        msg["To"] = to_email

        if text_content:
            msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            server.login(user, password)
            server.sendmail(user, to_email, msg.as_string())
        
        print(f"✅ Successfully sent email to {to_email}: {subject}")
        return True
    except Exception as e:
        print(f"❌ Failed to send email to {to_email} via SMTP: {e}")
        return False

def send_verification_email(to_email: str, username: str, token: str):
    base_url = get_app_base_url()
    verify_url = f"{base_url}/api/auth/verify-email?token={token}"
    subject = "Verify your email - Smart Study Scheduler"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; padding: 24px; }}
        .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }}
        .header {{ text-align: center; margin-bottom: 24px; }}
        .logo {{ font-size: 40px; }}
        h1 {{ font-size: 20px; color: #0f172a; margin: 12px 0 6px 0; }}
        p {{ font-size: 15px; line-height: 1.6; color: #475569; }}
        .btn {{ display: inline-block; background-color: #4f46e5; color: #ffffff !important; padding: 12px 24px; font-weight: 600; border-radius: 8px; text-decoration: none; margin: 20px 0; }}
        .footer {{ text-align: center; font-size: 12px; color: #94a3b8; margin-top: 24px; }}
        .link-text {{ word-break: break-all; font-size: 12px; color: #64748b; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="logo">📅</div>
          <h1>Confirm Your Email Address</h1>
        </div>
        <p>Hi <strong>{username}</strong>,</p>
        <p>Thank you for setting up study alerts! Please verify your email to start receiving automated task notifications and 1-click snooze links.</p>
        <div style="text-align: center;">
          <a href="{verify_url}" class="btn">Verify Email Address</a>
        </div>
        <p class="link-text">If the button doesn't work, visit:<br>{verify_url}</p>
        <div class="footer">
          Smart Study Scheduler & Tracker • Consistency beats intensity
        </div>
      </div>
    </body>
    </html>
    """
    text = f"Hi {username}, please verify your email for Smart Study Scheduler by visiting: {verify_url}"
    return send_email(to_email, subject, html, text)

def send_task_alert_email(to_email: str, username: str, task: dict, is_starting: bool = False):
    """
    Sends 5-minute pre-alert or Starting-now alert with 1-click snooze buttons.
    """
    base_url = get_app_base_url()
    task_name = task.get("task_name", "Study Task")
    start_time = task.get("start_time", "")
    end_time = task.get("end_time", "")
    priority = task.get("priority", "Medium")
    snooze_token = task.get("snooze_token", "")

    snooze_15_url = f"{base_url}/api/tasks/snooze?token={snooze_token}&mins=15"
    snooze_30_url = f"{base_url}/api/tasks/snooze?token={snooze_token}&mins=30"
    complete_url = f"{base_url}/api/tasks/complete-from-email?token={snooze_token}"

    if is_starting:
        subject = f"🚨 Starting Now: {task_name} ({start_time})"
        alert_title = "Your Study Task is Starting Now!"
        alert_badge = "STARTING NOW"
        badge_bg = "#dc2626"
    else:
        subject = f"⏰ 5-Minute Reminder: {task_name} starts at {start_time}"
        alert_title = "Task Starting in 5 Minutes!"
        alert_badge = "STARTING SOON"
        badge_bg = "#ea580c"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b; padding: 20px; }}
        .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 14px; padding: 28px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }}
        .badge {{ display: inline-block; background-color: {badge_bg}; color: #ffffff; padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }}
        h1 {{ font-size: 20px; color: #0f172a; margin: 0 0 16px 0; }}
        .task-detail {{ background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 8px; padding: 16px; margin: 16px 0; }}
        .task-detail h3 {{ margin: 0 0 8px 0; font-size: 18px; color: #1e293b; }}
        .meta-row {{ font-size: 14px; color: #64748b; margin: 4px 0; }}
        .actions-label {{ font-size: 13px; font-weight: 600; color: #475569; margin: 20px 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px; }}
        .btn {{ display: inline-block; padding: 10px 18px; font-size: 14px; font-weight: 600; border-radius: 6px; text-decoration: none; text-align: center; margin: 4px 4px 4px 0; }}
        .btn-snooze {{ background-color: #f1f5f9; color: #334155 !important; border: 1px solid #cbd5e1; }}
        .btn-done {{ background-color: #10b981; color: #ffffff !important; }}
        .footer {{ text-align: center; font-size: 12px; color: #94a3b8; margin-top: 24px; line-height: 1.5; }}
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">{alert_badge}</span>
        <h1>{alert_title}</h1>
        <p>Hey <strong>{username}</strong>, here are the details for your scheduled session:</p>
        
        <div class="task-detail">
          <h3>📌 {task_name}</h3>
          <div class="meta-row">⏰ <strong>Time:</strong> {start_time} - {end_time}</div>
          <div class="meta-row">🎯 <strong>Priority:</strong> {priority}</div>
        </div>

        <div class="actions-label">Quick 1-Click Remote Actions:</div>
        <div>
          <a href="{snooze_15_url}" class="btn btn-snooze">⏰ Snooze 15 Mins</a>
          <a href="{snooze_30_url}" class="btn btn-snooze">⏰ Snooze 30 Mins</a>
          <a href="{complete_url}" class="btn btn-done">✅ Mark Completed</a>
        </div>

        <div class="footer">
          Clicking snooze automatically postpones your task on the server and re-arms your alerts.<br>
          Smart Study Scheduler & Tracker
        </div>
      </div>
    </body>
    </html>
    """

    text = f"""
    {alert_title}
    Task: {task_name}
    Time: {start_time} - {end_time}
    Priority: {priority}

    Snooze 15 Mins: {snooze_15_url}
    Snooze 30 Mins: {snooze_30_url}
    Mark Complete: {complete_url}
    """
    return send_email(to_email, subject, html, text)
