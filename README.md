# 📚 Study Scheduler & Smart Task Companion

A full-stack intelligent task scheduling and study management platform built with **React**, **Vite**, **FastAPI**, and **SQLite**. Features include priority-based task scheduling (Earliest Deadline First algorithm), missed task tracking, user authentication, and interactive progress management.

---

## ⚡ Features

* **🎯 Priority Task Manager**: Schedule tasks with custom deadlines, status filtering (Pending/Completed), and smart focus task recommendations.
* **⏰ Earliest Deadline First (EDF) Algorithm**: Automated task ordering prioritizing urgent deadlines with priority level tie-breakers.
* **⚠️ Missed Tasks Modal**: Prompt detection and management of overdue/missed deadlines.
* **🔐 Authentication System**: Token-based user authentication backed by password hashing and SQLite WAL mode.
* **🎨 Modern UI**: Built with React, Vite, and responsive custom CSS components.

---

## 🛠️ Tech Stack

* **Frontend**: React, Vite, Custom CSS
* **Backend**: Python 3.11+, FastAPI, Uvicorn
* **Database**: SQLite3 (WAL Mode with thread lock synchronization)

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18+)
* **Python** (v3.10+)

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
# Activate virtual environment
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
python app.py
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

The application will be running at `http://localhost:5173`.
