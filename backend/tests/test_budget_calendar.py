"""Tests for the new Budget + Calendar features (HENZA FINTECH)."""
import os
from datetime import datetime, timezone
import pytest
import requests

def _load_env():
    for p in ("/app/frontend/.env", "/app/backend/.env"):
        try:
            with open(p) as f:
                for line in f:
                    if "=" in line and not line.strip().startswith("#"):
                        k, v = line.strip().split("=", 1)
                        os.environ.setdefault(k, v)
        except FileNotFoundError:
            pass

_load_env()
BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ============ BUDGET CRUD ============
class TestBudgetCRUD:
    created_ids = []
    tx_ids = []

    def test_create_budget_personal(self, client):
        r = client.post(f"{API}/budgets", json={
            "category": "konsumsi",
            "amount": 1500000,
            "scope": "personal",
            "notes": "TEST_budget"
        })
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["category"] == "konsumsi"
        assert b["amount"] == 1500000
        assert b["scope"] == "personal"
        assert "id" in b
        assert "_id" not in b
        TestBudgetCRUD.created_ids.append(b["id"])

    def test_create_budget_business(self, client):
        r = client.post(f"{API}/budgets", json={
            "category": "transportasi",
            "amount": 500000,
            "scope": "business"
        })
        assert r.status_code == 200
        TestBudgetCRUD.created_ids.append(r.json()["id"])

    def test_list_budgets_scope_personal(self, client):
        r = client.get(f"{API}/budgets", params={"scope": "personal"})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # every returned budget should be personal
        for b in data:
            assert b["scope"] == "personal"
            assert "_id" not in b
        # our personal creation should be present
        assert any(b["id"] == TestBudgetCRUD.created_ids[0] for b in data)

    def test_list_budgets_scope_business_filters(self, client):
        r = client.get(f"{API}/budgets", params={"scope": "business"})
        assert r.status_code == 200
        for b in r.json():
            assert b["scope"] == "business"

    def test_update_budget(self, client):
        bid = TestBudgetCRUD.created_ids[0]
        r = client.put(f"{API}/budgets/{bid}", json={
            "category": "konsumsi",
            "amount": 2000000,
            "scope": "personal",
            "notes": "TEST_updated"
        })
        assert r.status_code == 200
        assert r.json()["amount"] == 2000000
        # verify persistence
        g = client.get(f"{API}/budgets", params={"scope": "personal"}).json()
        found = [b for b in g if b["id"] == bid]
        assert found and found[0]["amount"] == 2000000

    def test_update_budget_404(self, client):
        r = client.put(f"{API}/budgets/nonexistent-id", json={
            "category": "x", "amount": 1, "scope": "personal"
        })
        assert r.status_code == 404


# ============ BUDGET OVERVIEW ============
class TestBudgetOverview:
    def test_overview_shape(self, client):
        r = client.get(f"{API}/budget/overview", params={"scope": "personal"})
        assert r.status_code == 200
        d = r.json()
        for k in ["scope", "year", "month", "budgets", "total_budget",
                  "total_spent", "income", "remaining"]:
            assert k in d, f"missing {k}"
        assert d["scope"] == "personal"
        # remaining = income - total_budget
        assert abs(d["remaining"] - (d["income"] - d["total_budget"])) < 0.001
        # each budget has spent + remaining
        for b in d["budgets"]:
            assert "spent" in b and "remaining" in b
            assert abs(b["remaining"] - (b["amount"] - b["spent"])) < 0.001

    def test_overview_spent_reflects_expense(self, client):
        # Ensure a konsumsi personal budget exists for this test
        b = client.post(f"{API}/budgets", json={
            "category": "konsumsi", "amount": 3000000, "scope": "personal",
            "notes": "TEST_ov_spent"
        }).json()
        TestBudgetCRUD.created_ids.append(b["id"])

        now = datetime.now(timezone.utc)
        before = client.get(f"{API}/budget/overview",
                            params={"scope": "personal"}).json()
        before_spent = next(
            (x["spent"] for x in before["budgets"] if x["category"] == "konsumsi"),
            0.0,
        )

        tx = client.post(f"{API}/transactions", json={
            "type": "expense",
            "scope": "personal",
            "category": "konsumsi",
            "amount": 123456,
            "description": "TEST_budget_expense",
            "date": now.isoformat(),
        })
        assert tx.status_code == 200
        tx_id = tx.json()["id"]
        TestBudgetCRUD.tx_ids.append(tx_id)

        after = client.get(f"{API}/budget/overview",
                           params={"scope": "personal"}).json()
        after_spent = next(
            (x["spent"] for x in after["budgets"] if x["category"] == "konsumsi"),
            0.0,
        )
        assert after_spent - before_spent == pytest.approx(123456, abs=0.01), (
            f"Expected spent to grow by 123456, got before={before_spent} after={after_spent}"
        )


# ============ CALENDAR ============
class TestCalendar:
    def test_calendar_shape(self, client):
        now = datetime.now(timezone.utc)
        r = client.get(f"{API}/calendar", params={
            "scope": "all", "year": now.year, "month": now.month
        })
        assert r.status_code == 200
        d = r.json()
        for k in ["scope", "year", "month", "days", "total_income", "total_expense"]:
            assert k in d
        assert d["year"] == now.year and d["month"] == now.month
        assert isinstance(d["days"], dict)
        # our test expense from above should appear today
        today_key = now.strftime("%Y-%m-%d")
        if today_key in d["days"]:
            assert d["days"][today_key]["expense"] >= 123456

    def test_calendar_scope_filter(self, client):
        # create a business expense
        now = datetime.now(timezone.utc)
        biz_tx = client.post(f"{API}/transactions", json={
            "type": "expense",
            "scope": "business",
            "category": "lainnya",
            "amount": 777777,
            "description": "TEST_biz_calendar",
            "date": now.isoformat(),
        })
        assert biz_tx.status_code == 200
        TestBudgetCRUD.tx_ids.append(biz_tx.json()["id"])

        personal = client.get(f"{API}/calendar", params={
            "scope": "personal", "year": now.year, "month": now.month
        }).json()
        business = client.get(f"{API}/calendar", params={
            "scope": "business", "year": now.year, "month": now.month
        }).json()

        today_key = now.strftime("%Y-%m-%d")
        # personal must NOT include the 777777 business expense
        p_today = personal["days"].get(today_key, {"expense": 0})
        b_today = business["days"].get(today_key, {"expense": 0})
        assert b_today["expense"] >= 777777
        # If personal has today, it shouldn't include the business expense amount
        assert p_today["expense"] < 777777 or (b_today["expense"] > p_today["expense"])


# ============ CLEANUP ============
class TestZCleanup:
    def test_cleanup(self, client):
        for bid in TestBudgetCRUD.created_ids:
            r = client.delete(f"{API}/budgets/{bid}")
            assert r.status_code == 200
        # verify 404 on second delete
        if TestBudgetCRUD.created_ids:
            r2 = client.delete(f"{API}/budgets/{TestBudgetCRUD.created_ids[0]}")
            assert r2.status_code == 404
        for tid in TestBudgetCRUD.tx_ids:
            client.delete(f"{API}/transactions/{tid}")
