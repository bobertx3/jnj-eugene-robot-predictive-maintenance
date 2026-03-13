#!/usr/bin/env python3
import json
import os
from urllib import error, request


def env_or_default(name: str, default: str) -> str:
    value = os.getenv(name)
    return value if value else default


def build_payload() -> dict:
    catalog = env_or_default("CATALOG", "bx4")
    schema = env_or_default("SCHEMA", "dsp2")
    warehouse_id = env_or_default("WAREHOUSE_ID", "6ebfe102e1ecba75")

    return {
        "display_name": "EUGENE Maintenance Analyst",
        "description": (
            "Natural language analytics space for EUGENE robot maintenance KPIs "
            "and model-style risk scoring outputs."
        ),
        "warehouse_id": warehouse_id,
        "table_identifiers": [
            f"{catalog}.{schema}.gold_eugene_maintenance_kpis",
            f"{catalog}.{schema}.gold_eugene_maintenance_risk_ml",
        ],
        "sample_questions": [
            "Which robots have the highest maintenance risk score this week?",
            "Show daily maintenance risk trend for the last 14 days.",
            "Which component types contribute the most error events?",
            "List rows where either rules or ML indicates service is needed.",
            "Which sites have the highest concentration of high-risk components?",
        ],
    }


def main() -> None:
    host = os.getenv("DATABRICKS_HOST")
    token = os.getenv("DATABRICKS_TOKEN")
    if not host or not token:
        raise SystemExit("Missing DATABRICKS_HOST or DATABRICKS_TOKEN environment variable.")

    payload = build_payload()
    body = json.dumps(payload).encode("utf-8")

    req = request.Request(
        url=f"{host.rstrip('/')}/api/2.0/data-rooms/",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(req) as response:
            raw = response.read().decode("utf-8")
            print(raw)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise SystemExit(f"Failed to create Genie space: {exc.code} {detail}") from exc


if __name__ == "__main__":
    main()
