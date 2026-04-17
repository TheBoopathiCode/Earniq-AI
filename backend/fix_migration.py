import pymysql
conn = pymysql.connect(host='localhost', user='root', password='Ekansh123', database='earniq', autocommit=True)
cur = conn.cursor()

for sql, label in [
    ('ALTER TABLE claims ADD COLUMN disruption_event_id INT NULL', 'disruption_event_id column'),
    ('ALTER TABLE claims ADD INDEX idx_claims_disruption_event_id (disruption_event_id)', 'disruption_event_id index'),
]:
    try:
        cur.execute(sql)
        print('OK:', label)
    except Exception as e:
        print('Skip:', label, '-', e)

cur.execute("SHOW COLUMNS FROM claims LIKE 'disruption_event_id'")
row = cur.fetchone()
print('Column exists:', row is not None)
conn.close()
