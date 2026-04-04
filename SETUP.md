# EarniqAI — One-Command Setup

## Prerequisites (only these needed)
- Python 3.10+
- Node.js 18+
- MySQL running locally

## Run Everything in One Go

### Windows
```
setup.bat
```

### Mac/Linux
```
chmod +x setup.sh && ./setup.sh
```

That's it. Both frontend and backend start automatically.

## Manual Setup (if scripts don't work)

### 1. Backend
```
cd backend
pip install -r requirements.txt
copy .env.example .env
python seed.py
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (new terminal)
```
npm install
npm run dev
```

## Default Credentials
- MySQL: root / your password (update backend/.env)
- App URL: http://localhost:5173
- API URL: http://localhost:8000
- API Docs: http://localhost:8000/docs
