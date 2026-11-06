"""Verify the unbuilt synthetic demo and existing Ticket runner contract."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT / "examples" / "support-desk"


def query(zone, sql):
    result = subprocess.run(
        ["duckdb", str(PROJECT / "warehouse" / f"{zone}.duckdb"),
         "-readonly", "-json", "-c", sql],
        text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout)


class DemoTest(unittest.TestCase):
    def test_initial_inventory_and_synthetic_source(self):
        self.assertFalse((PROJECT / "support_metric_store/service_delivery/Incident").exists())
        for zone in ("zone1", "zone2"):
            inventory = query(zone, "SELECT table_schema, table_name FROM information_schema.tables")
            self.assertEqual(len(inventory), 9)
            self.assertEqual(sum(row["table_schema"] == "demo_gold_source_a" for row in inventory), 3)
            self.assertFalse(any("Incident_" in row["table_name"] for row in inventory))
            for entity in ("tickets", "incidents", "releases"):
                profile = query(zone, f"""
                    SELECT COUNT(*) AS n,
                           COUNT(*) FILTER (WHERE account_id IS NULL OR workspace_id IS NULL OR user_id IS NULL) AS missing_grains,
                           COUNT(*) FILTER (WHERE is_deleted) AS deleted
                    FROM demo_gold_source_a.{entity}
                """)[0]
                self.assertGreater(profile["n"], 0)
                self.assertEqual(profile["missing_grains"], 0)
                self.assertGreater(profile["deleted"], 0)

    def test_ticket_store_reconciles_to_source_for_both_zones_and_all_grains(self):
        for zone in ("zone1", "zone2"):
            source = query(zone, """
                SELECT COUNT(*) AS created, COUNT(closed_at) AS closed
                FROM demo_gold_source_a.tickets WHERE is_deleted = false
            """)[0]
            for grain in ("Account", "Workspace", "User"):
                table = f"demo_gold_support_metric_store.Ticket_{grain}_Metrics_Snapshot_Cumulative"
                result = query(zone, f"""
                    SELECT metric_name, SUM(metric_value)::BIGINT AS total FROM {table}
                    WHERE SNAPSHOT_DATE = (SELECT MAX(SNAPSHOT_DATE) FROM {table})
                    GROUP BY metric_name
                """)
                totals = {row["metric_name"]: row["total"] for row in result}
                self.assertEqual(totals["total_ticket_create_count"], source["created"])
                self.assertEqual(totals["total_ticket_close_count"], source["closed"])

    def test_existing_runners_emit_sql_without_deploying(self):
        for cadence in ("Daily", "Cumulative"):
            result = subprocess.run(
                [sys.executable, f"support_metric_store/common/{cadence.lower()}_runner.py",
                 f"support_metric_store/service_delivery/Ticket/Code/Ticket_Metrics_Snapshot_{cadence}.py"],
                cwd=PROJECT, capture_output=True, text=True, check=True,
            )
            self.assertIn("total_ticket_create_count", result.stdout)
            self.assertIn("total_ticket_close_count", result.stdout)
            self.assertNotIn("Incident", result.stdout)

    def test_verifier_is_available_from_project_cwd_and_keeps_package_state_root(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "skills/forge-builder/verify.py"),
             "phase-entry", "setup-verification-no-build", "2"],
            cwd=PROJECT, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("HALT: No build-state file", result.stdout)
        self.assertIn(str(ROOT / "skills/forge-builder/.build-state"), result.stdout)


if __name__ == "__main__":
    unittest.main()
