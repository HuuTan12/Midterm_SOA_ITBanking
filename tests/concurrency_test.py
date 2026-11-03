import sys, threading
import httpx

AUTH = "http://127.0.0.1:8001"
TUI = "http://127.0.0.1:8002"
PAY = "http://127.0.0.1:8003"


def login(username):
    r = httpx.post(f"{AUTH}/auth/login", json={"username": username, "password": "123456"})
    r.raise_for_status()
    return {"Authorization": "Bearer " + r.json()["access_token"]}


def balance(h):
    return httpx.get(f"{AUTH}/users/me", headers=h).json()["balance"]


def create(h, mssv):
    r = httpx.post(f"{PAY}/payments", json={"mssv": mssv}, headers=h, timeout=20)
    r.raise_for_status()
    d = r.json()
    if "debug_otp" not in d:
        sys.exit("Thiếu debug_otp: đặt DEBUG_RETURN_OTP=1 trong .env rồi restart payment-service")
    return d["transaction_id"], d["debug_otp"]


def verify_parallel(jobs):
    """jobs: [(tên, headers, tx_id, otp)]. Tất cả thread chờ nhau rồi bắn cùng lúc."""
    barrier = threading.Barrier(len(jobs))
    results = {}

    def run(name, h, tx, otp):
        with httpx.Client(timeout=30) as c:
            barrier.wait()
            r = c.post(f"{PAY}/payments/{tx}/verify-otp", json={"otp": otp}, headers=h)
            results[name] = (r.status_code, r.json())

    threads = [threading.Thread(target=run, args=j) for j in jobs]
    for t in threads: t.start()
    for t in threads: t.join()
    return results


def show(results):
    for name, (code, body) in results.items():
        print(f"  {name}: HTTP {code} -> {body.get('status') or body.get('detail')}")


def scenario_a():
    print("=== (a) 2 user cùng trả MSSV 524H0028 (15tr) ===")
    h1, h2 = login("tan"), login("viet")
    b1, b2 = balance(h1), balance(h2)
    tx1, o1 = create(h1, "524H0028")
    tx2, o2 = create(h2, "524H0028")
    res = verify_parallel([("tan", h1, tx1, o1), ("viet", h2, tx2, o2)])
    show(res)
    a1, a2 = balance(h1), balance(h2)
    print(f"  Số dư tan : {b1} -> {a1}")
    print(f"  Số dư viet: {b2} -> {a2}")
    print("  Học phí   :", httpx.get(f"{TUI}/api/tuition/524H0028").json()["status"])
    codes = sorted(c for c, _ in res.values())
    ok = codes == [200, 409] and (b1 - a1) + (b2 - a2) == 15_000_000
    print("  KẾT QUẢ:", "PASS (chỉ 1 người trả, người kia được hoàn tiền)" if ok else "FAIL")


def scenario_b():
    print("=== (b) tan (20tr) trả song song 524H0028 (15tr) + 524H0029 (12.5tr) ===")
    h = login("tan")
    b = balance(h)
    tx1, o1 = create(h, "524H0028")
    tx2, o2 = create(h, "524H0029")
    res = verify_parallel([("MSSV 524H0028", h, tx1, o1), ("MSSV 524H0029", h, tx2, o2)])
    show(res)
    a = balance(h)
    print(f"  Số dư tan: {b} -> {a}")
    codes = sorted(c for c, _ in res.values())
    ok = codes == [200, 402] and a >= 0 and (b - a) in (15_000_000, 12_500_000)
    print("  KẾT QUẢ:", "PASS (chỉ 1 giao dịch thành công, số dư không âm)" if ok else "FAIL")


if __name__ == "__main__":
    {"a": scenario_a, "b": scenario_b}[sys.argv[1]]()