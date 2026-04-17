import pymysql
import os
import sys

# Read from .env
db_url = None
env_path = os.path.join(os.path.dirname(__file__), '.env')
with open(env_path) as f:
    for line in f:
        if line.startswith('DATABASE_URL='):
            db_url = line.strip().split('=', 1)[1]
            break

# Parse mysql+pymysql://user:pass@host:port/db
# e.g. mysql+pymysql://root:Ekansh123@localhost:3306/earniq
url = db_url.replace('mysql+pymysql://', '')
user_pass, rest = url.split('@')
user, password = user_pass.split(':', 1)
host_port, dbname = rest.split('/')
host, port = (host_port.split(':') + ['3306'])[:2]

print(f"Connecting to {host}:{port} db={dbname} user={user}")

conn = pymysql.connect(
    host=host, port=int(port), user=user,
    password=password, database=dbname, autocommit=True
)
cur = conn.cursor()

# Show current columns
cur.execute('SHOW COLUMNS FROM zones')
existing = {r[0] for r in cur.fetchall()}
print(f"Existing columns: {sorted(existing)}")

new_cols = [
    ('waterlogging_freq',   'FLOAT DEFAULT 0.30'),
    ('aqi_baseline_annual', 'FLOAT DEFAULT 120'),
    ('heat_days_per_year',  'INT DEFAULT 20'),
    ('traffic_density',     'FLOAT DEFAULT 0.55'),
    ('govt_alert_freq',     'FLOAT DEFAULT 0.12'),
]

for col, defn in new_cols:
    if col in existing:
        print(f"  SKIP {col} (already exists)")
    else:
        sql = f'ALTER TABLE zones ADD COLUMN {col} {defn}'
        print(f"  EXEC: {sql}")
        cur.execute(sql)
        print(f"  OK: {col} added")

conn.close()
print("Migration complete.")
