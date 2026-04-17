import sys
sys.path.insert(0, 'backend')
try:
    from app.main import app
    print("SERVER: OK - imports successfully")
except Exception as e:
    print("SERVER ERROR:", e)
