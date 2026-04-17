import pymysql
conn = pymysql.connect(host='localhost', user='root', password='Ekansh123', database='earniq', autocommit=True)
cur = conn.cursor()
stmts = [
    'ALTER TABLE workers  ADD INDEX idx_workers_zone_id  (zone_id)',
    'ALTER TABLE workers  ADD INDEX idx_workers_is_active (is_active)',
    'ALTER TABLE policies ADD INDEX idx_policies_worker_id (worker_id)',
    'ALTER TABLE policies ADD INDEX idx_policies_is_active (is_active)',
    'ALTER TABLE claims   ADD INDEX idx_claims_worker_id  (worker_id)',
    'ALTER TABLE claims   ADD INDEX idx_claims_policy_id  (policy_id)',
    'ALTER TABLE claims   ADD INDEX idx_claims_status     (status)',
    'ALTER TABLE claims   ADD INDEX idx_claims_created_at (created_at)',
    'ALTER TABLE claims   ADD INDEX idx_claims_paid_at    (paid_at)',
]
for s in stmts:
    try:
        cur.execute(s)
        print('OK:', s.split('ADD INDEX')[1].strip().split('(')[0].strip())
    except Exception as e:
        print('Skip:', e)

# Verify
cur.execute("SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema='earniq' AND table_name='claims'")
print(f"claims indexes: {cur.fetchone()[0]}")
conn.close()
print('Done')
