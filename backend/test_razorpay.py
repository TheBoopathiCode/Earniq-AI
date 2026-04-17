import requests, base64, json

KEY_ID     = "rzp_test_SdP40gBvtBVmAY"
KEY_SECRET = "rXgjrWMf4uFM7UvVnpYNefI4"
ACCOUNT_NO = "2323230068665557"

auth = base64.b64encode(f"{KEY_ID}:{KEY_SECRET}".encode()).decode()
headers = {"Authorization": f"Basic {auth}", "Content-Type": "application/json"}

# 1. Check key validity via /v1/payments (empty list = valid key)
r = requests.get("https://api.razorpay.com/v1/payments?count=1", headers=headers)
print(f"Key check: {r.status_code}")
if r.status_code == 401:
    print("INVALID keys — authentication failed")
elif r.status_code == 200:
    print("Keys are VALID")
else:
    print(r.text[:300])

# 2. Check payout account balance
r2 = requests.get(
    f"https://api.razorpay.com/v1/banking_accounts/{ACCOUNT_NO}",
    headers=headers
)
print(f"\nPayout account check: {r2.status_code}")
print(r2.text[:400])

# 3. Try creating a contact (needed before payout)
r3 = requests.post(
    "https://api.razorpay.com/v1/contacts",
    headers=headers,
    json={"name": "Test Worker", "type": "employee", "reference_id": "earniq_test_001"}
)
print(f"\nContact creation: {r3.status_code}")
print(r3.text[:400])
