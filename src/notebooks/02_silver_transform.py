# Databricks notebook source
from pyspark.sql import DataFrame
from pyspark.sql import functions as F


def get_param(name: str, default: str) -> str:
    try:
        return dbutils.widgets.get(name)  # type: ignore[name-defined]
    except Exception:
        return default


try:
    dbutils.widgets.text("catalog", "bx4")  # type: ignore[name-defined]
    dbutils.widgets.text("schema", "dsp2")  # type: ignore[name-defined]
except Exception:
    pass

CATALOG = get_param("catalog", "bx4")
SCHEMA = get_param("schema", "dsp2")


def write_silver(df: DataFrame, table_name: str) -> None:
    target_table = f"{CATALOG}.{SCHEMA}.{table_name}"
    (
        df.write.format("delta")
        .mode("overwrite")
        .option("overwriteSchema", "true")
        .saveAsTable(target_table)
    )
    print(f"Wrote {df.count()} rows to {target_table}")


telemetry_bronze = spark.table(f"{CATALOG}.{SCHEMA}.bronze_eugene_robot_telemetry")
telemetry_silver = (
    telemetry_bronze.select(
        F.to_timestamp("event_ts").alias("event_ts"),
        F.upper(F.trim("robot_id")).alias("robot_id"),
        F.upper(F.trim("component_id")).alias("component_id"),
        F.lower(F.trim("component_type")).alias("component_type"),
        F.col("temperature_c").cast("double").alias("temperature_c"),
        F.col("vibration_mm_s").cast("double").alias("vibration_mm_s"),
        F.trim("error_code").alias("error_code"),
        F.upper(F.trim("surgery_case_id")).alias("surgery_case_id"),
    )
    .filter(
        F.col("event_ts").isNotNull()
        & F.col("robot_id").isNotNull()
        & F.col("component_id").isNotNull()
        & F.col("component_type").isNotNull()
    )
)
write_silver(telemetry_silver, "silver_eugene_robot_telemetry")

cases_bronze = spark.table(f"{CATALOG}.{SCHEMA}.bronze_eugene_surgery_cases")
cases_silver = (
    cases_bronze.select(
        F.upper(F.trim("case_id")).alias("case_id"),
        F.upper(F.trim("robot_id")).alias("robot_id"),
        F.lower(F.trim("procedure_type")).alias("procedure_type"),
        F.to_timestamp("case_start_ts").alias("case_start_ts"),
        F.to_timestamp("case_end_ts").alias("case_end_ts"),
        F.col("duration_min").cast("int").alias("duration_min"),
        F.lower(F.trim("outcome")).alias("outcome"),
    )
    .filter(
        F.col("case_id").isNotNull()
        & F.col("robot_id").isNotNull()
        & F.col("case_start_ts").isNotNull()
    )
)
write_silver(cases_silver, "silver_eugene_surgery_cases")

assets_bronze = spark.table(f"{CATALOG}.{SCHEMA}.bronze_eugene_robot_assets")
assets_silver = (
    assets_bronze.select(
        F.upper(F.trim("robot_id")).alias("robot_id"),
        F.upper(F.trim("site_id")).alias("site_id"),
        F.trim("site_name").alias("site_name"),
        F.to_date("install_date").alias("install_date"),
        F.to_date("last_service_date").alias("last_service_date"),
        F.col("service_interval_days").cast("int").alias("service_interval_days"),
    )
    .filter(
        F.col("robot_id").isNotNull()
        & F.col("site_id").isNotNull()
        & F.col("site_name").isNotNull()
    )
)
write_silver(assets_silver, "silver_eugene_robot_assets")

site_locations_bronze = spark.table(f"{CATALOG}.{SCHEMA}.bronze_eugene_site_locations")
site_locations_silver = (
    site_locations_bronze.select(
        F.upper(F.trim("site_id")).alias("site_id"),
        F.trim("site_name").alias("site_name"),
        F.col("latitude").cast("double").alias("latitude"),
        F.col("longitude").cast("double").alias("longitude"),
        F.trim("region").alias("region"),
    )
    .filter(
        F.col("site_id").isNotNull()
        & F.col("site_name").isNotNull()
        & F.col("latitude").isNotNull()
        & F.col("longitude").isNotNull()
    )
    .dropDuplicates(["site_id"])
)
write_silver(site_locations_silver, "silver_eugene_site_locations")
