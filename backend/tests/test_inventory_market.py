"""Tests for Inventory (Rekap Stok) and Market Indicators endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ============ MARKET INDICATORS ============
class TestMarket:
    def test_get_indicators_shape(self, s):
        r = s.get(f"{API}/market/indicators", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "indicators" in j and "live" in j
        keys = [i["key"] for i in j["indicators"]]
        for k in ("bi_rate", "inflation", "sbn10y", "gold", "jci"):
            assert k in keys, f"missing indicator {k}"
        # Editable flags
        by = {i["key"]: i for i in j["indicators"]}
        assert by["bi_rate"]["editable"] is True
        assert by["inflation"]["editable"] is True
        assert by["sbn10y"]["editable"] is True
        assert by["gold"]["editable"] is False
        assert by["jci"]["editable"] is False
        # Manual defaults numeric
        assert isinstance(by["bi_rate"]["value"], (int, float))
        assert isinstance(by["inflation"]["value"], (int, float))
        assert isinstance(by["sbn10y"]["value"], (int, float))

    def test_live_fields_shape(self, s):
        r = s.get(f"{API}/market/indicators", timeout=15)
        by = {i["key"]: i for i in r.json()["indicators"]}
        # gold & jci should always be present; value may be None if fetch blocked
        for k in ("gold", "jci"):
            assert "value" in by[k]
            assert "change_pct" in by[k]

    def test_put_config_persists(self, s):
        payload = {"bi_rate": 5.75, "bi_rate_asof": "TEST Sep 2026"}
        r = s.put(f"{API}/market/config", json=payload, timeout=10)
        assert r.status_code == 200
        # Verify GET reflects it
        g = s.get(f"{API}/market/indicators", timeout=15).json()
        bi = next(i for i in g["indicators"] if i["key"] == "bi_rate")
        assert bi["value"] == 5.75
        assert bi["as_of"] == "TEST Sep 2026"

        # Update another field
        r2 = s.put(f"{API}/market/config", json={"inflation": 4.2, "sbn10y": 7.5}, timeout=10)
        assert r2.status_code == 200
        g2 = s.get(f"{API}/market/indicators", timeout=15).json()
        by = {i["key"]: i for i in g2["indicators"]}
        assert by["inflation"]["value"] == 4.2
        assert by["sbn10y"]["value"] == 7.5
        # bi_rate still 5.75
        assert by["bi_rate"]["value"] == 5.75


# ============ INVENTORY ============
class TestInventory:
    created_ids: list = []

    def test_stats_baseline(self, s):
        r = s.get(f"{API}/inventory/stats", timeout=10)
        assert r.status_code == 200
        j = r.json()
        for k in ("total_items", "total_qty", "in_stock_items", "in_stock_qty", "out_items", "out_qty"):
            assert k in j

    def test_create_in_stock(self, s):
        r = s.post(f"{API}/inventory", json={
            "name": "TEST_Beras 5kg",
            "quantity": 10,
            "unit": "sak",
            "entry_date": "2026-01-05",
        }, timeout=10)
        assert r.status_code == 200, r.text
        obj = r.json()
        assert obj["name"] == "TEST_Beras 5kg"
        assert obj["quantity"] == 10
        assert obj["unit"] == "sak"
        assert obj["entry_date"] == "2026-01-05"
        assert not obj.get("exit_date")
        assert "id" in obj
        TestInventory.created_ids.append(obj["id"])

    def test_create_out(self, s):
        r = s.post(f"{API}/inventory", json={
            "name": "TEST_Minyak 1L",
            "quantity": 5,
            "unit": "btl",
            "entry_date": "2026-01-01",
            "exit_date": "2026-01-10",
        }, timeout=10)
        assert r.status_code == 200
        obj = r.json()
        assert obj["exit_date"] == "2026-01-10"
        TestInventory.created_ids.append(obj["id"])

    def test_list_and_search(self, s):
        r = s.get(f"{API}/inventory", timeout=10)
        assert r.status_code == 200
        names = [i["name"] for i in r.json()]
        assert "TEST_Beras 5kg" in names
        assert "TEST_Minyak 1L" in names

        # Search
        r2 = s.get(f"{API}/inventory", params={"q": "Beras"}, timeout=10)
        assert r2.status_code == 200
        names2 = [i["name"] for i in r2.json()]
        assert any("Beras" in n for n in names2)
        assert not any("Minyak" in n for n in names2)

    def test_stats_after_create(self, s):
        r = s.get(f"{API}/inventory/stats", timeout=10)
        j = r.json()
        # Our 2 items contribute: total_qty += 15, in_stock += 10, out += 5
        assert j["total_items"] >= 2
        assert j["total_qty"] >= 15
        assert j["in_stock_qty"] >= 10
        assert j["out_qty"] >= 5

    def test_update_flips_to_out(self, s):
        iid = TestInventory.created_ids[0]  # was in-stock
        r = s.put(f"{API}/inventory/{iid}", json={
            "name": "TEST_Beras 5kg",
            "quantity": 8,
            "unit": "sak",
            "entry_date": "2026-01-05",
            "exit_date": "2026-01-15",
        }, timeout=10)
        assert r.status_code == 200
        assert r.json()["exit_date"] == "2026-01-15"
        assert r.json()["quantity"] == 8

        # Verify persistence + stats
        lst = s.get(f"{API}/inventory", timeout=10).json()
        item = next(i for i in lst if i["id"] == iid)
        assert item["quantity"] == 8
        assert item["exit_date"] == "2026-01-15"

    def test_update_404(self, s):
        r = s.put(f"{API}/inventory/does-not-exist", json={
            "name": "x", "quantity": 1, "unit": "pcs",
        }, timeout=10)
        assert r.status_code == 404

    def test_delete_and_404(self, s):
        for iid in TestInventory.created_ids:
            r = s.delete(f"{API}/inventory/{iid}", timeout=10)
            assert r.status_code == 200
        # Confirm gone
        for iid in TestInventory.created_ids:
            r = s.delete(f"{API}/inventory/{iid}", timeout=10)
            assert r.status_code == 404
        TestInventory.created_ids.clear()
