import ast
with open('app/routers/admin.py') as f:
    src = f.read()
ast.parse(src)
print('admin.py syntax OK')
