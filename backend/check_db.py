import pymysql
try:
    c = pymysql.connect(host='localhost', user='root', password='Ekansh123')
    print('MySQL connected OK')
    c.cursor().execute("CREATE DATABASE IF NOT EXISTS earniq")
    print('Database earniq ready')
    c.close()
except Exception as e:
    print(f'ERROR: {e}')
