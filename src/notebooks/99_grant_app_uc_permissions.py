# Databricks notebook source
def get_param(name: str, default: str) -> str:
    try:
        return dbutils.widgets.get(name)  # type: ignore[name-defined]
    except Exception:
        return default


try:
    dbutils.widgets.text("catalog", "bx4")  # type: ignore[name-defined]
    dbutils.widgets.text("schema", "dsp2")  # type: ignore[name-defined]
    dbutils.widgets.text(  # type: ignore[name-defined]
        "app_service_principal_id", "3fb7716d-5476-43b9-94c3-36197f6a202c"
    )
except Exception:
    pass

catalog = get_param("catalog", "bx4")
schema = get_param("schema", "dsp2")
principal_id = get_param(
    "app_service_principal_id", "3fb7716d-5476-43b9-94c3-36197f6a202c"
).strip()

if not principal_id:
    raise ValueError("app_service_principal_id is required")

quoted_principal = f"`{principal_id}`"

grant_statements = [
    f"GRANT USE CATALOG ON CATALOG `{catalog}` TO {quoted_principal}",
    f"GRANT USE SCHEMA ON SCHEMA `{catalog}`.`{schema}` TO {quoted_principal}",
    f"GRANT SELECT ON SCHEMA `{catalog}`.`{schema}` TO {quoted_principal}",
    f"GRANT SELECT ON TABLE `{catalog}`.`{schema}`.`gold_eugene_maintenance_kpis` TO {quoted_principal}",
    f"GRANT SELECT ON TABLE `{catalog}`.`{schema}`.`gold_eugene_maintenance_risk_ml` TO {quoted_principal}",
]

for stmt in grant_statements:
    print(f"Executing: {stmt}")
    spark.sql(stmt)

print(
    f"Applied UC grants for principal {principal_id} on "
    f"{catalog}.{schema} as final workflow task."
)
