# Databricks notebook source
def get_param(name: str, default: str) -> str:
    try:
        return dbutils.widgets.get(name)  # type: ignore[name-defined]
    except Exception:
        return default


try:
    dbutils.widgets.text("catalog", "bx4")  # type: ignore[name-defined]
    dbutils.widgets.text("schema", "bottava")  # type: ignore[name-defined]
    dbutils.widgets.text(  # type: ignore[name-defined]
        "app_service_principal_id", "52e1e28f-3ca6-4cbc-bad7-d5fb2ca3cca8"
    )
except Exception:
    pass

catalog = get_param("catalog", "bx4")
schema = get_param("schema", "bottava")
principal_id = get_param(
    "app_service_principal_id", "52e1e28f-3ca6-4cbc-bad7-d5fb2ca3cca8"
).strip()

if not principal_id:
    raise ValueError("app_service_principal_id is required")

quoted_principal = f"`{principal_id}`"

grant_statements = [
    f"GRANT USE CATALOG ON CATALOG `{catalog}` TO {quoted_principal}",
    f"GRANT USE SCHEMA ON SCHEMA `{catalog}`.`{schema}` TO {quoted_principal}",
    f"GRANT SELECT ON SCHEMA `{catalog}`.`{schema}` TO {quoted_principal}",
    f"GRANT SELECT ON TABLE `{catalog}`.`{schema}`.`gold_bottava_maintenance_kpis` TO {quoted_principal}",
    f"GRANT SELECT ON TABLE `{catalog}`.`{schema}`.`gold_bottava_maintenance_risk_ml` TO {quoted_principal}",
]

for stmt in grant_statements:
    print(f"Executing: {stmt}")
    spark.sql(stmt)

print(
    f"Applied UC grants for principal {principal_id} on "
    f"{catalog}.{schema} as final workflow task."
)
