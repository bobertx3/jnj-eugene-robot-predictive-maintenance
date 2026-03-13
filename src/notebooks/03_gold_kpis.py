# Databricks notebook source
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

telemetry = spark.table(f"{CATALOG}.{SCHEMA}.silver_eugene_robot_telemetry")
cases = spark.table(f"{CATALOG}.{SCHEMA}.silver_eugene_surgery_cases")
assets = spark.table(f"{CATALOG}.{SCHEMA}.silver_eugene_robot_assets").select(
    "robot_id",
    "site_id",
    F.col("site_name").alias("asset_site_name"),
    "install_date",
    "last_service_date",
    "service_interval_days",
)
site_locations = spark.table(f"{CATALOG}.{SCHEMA}.silver_eugene_site_locations").select(
    "site_id",
    F.col("site_name").alias("location_site_name"),
    "latitude",
    "longitude",
    "region",
)

last_case_by_robot = (
    cases.groupBy("robot_id")
    .agg(
        F.max(
            F.struct(
                F.col("case_start_ts"),
                F.col("procedure_type"),
                F.col("case_id"),
                F.col("outcome"),
            )
        ).alias("last_case")
    )
    .select(
        "robot_id",
        F.col("last_case.case_start_ts").alias("last_case_start_ts"),
        F.col("last_case.procedure_type").alias("last_case_procedure_type"),
        F.col("last_case.case_id").alias("last_case_id"),
        F.col("last_case.outcome").alias("last_case_outcome"),
    )
)

cases_by_robot_day = (
    cases.withColumn("event_date", F.to_date("case_start_ts"))
    .groupBy("robot_id", "event_date")
    .agg(
        F.count("*").alias("case_count"),
        F.sum("duration_min").alias("case_duration_min_total"),
        F.avg("duration_min").alias("case_duration_min_avg"),
    )
)

kpis = (
    telemetry.withColumn("event_date", F.to_date("event_ts"))
    .groupBy("robot_id", "component_id", "component_type", "event_date")
    .agg(
        F.count("*").alias("event_count"),
        F.sum(F.when(F.col("error_code").isNotNull(), F.lit(1)).otherwise(F.lit(0))).alias(
            "error_events"
        ),
        F.avg("temperature_c").alias("avg_temperature_c"),
        F.max("temperature_c").alias("max_temperature_c"),
        F.avg("vibration_mm_s").alias("avg_vibration_mm_s"),
        F.max("vibration_mm_s").alias("max_vibration_mm_s"),
    )
    .join(cases_by_robot_day, on=["robot_id", "event_date"], how="left")
    .join(assets, on="robot_id", how="left")
    .join(site_locations, on="site_id", how="left")
    .join(last_case_by_robot, on="robot_id", how="left")
    .withColumn("case_count", F.coalesce(F.col("case_count"), F.lit(0)))
    .withColumn("case_duration_min_total", F.coalesce(F.col("case_duration_min_total"), F.lit(0)))
    .withColumn("case_duration_min_avg", F.coalesce(F.col("case_duration_min_avg"), F.lit(0.0)))
    .withColumn("site_name", F.coalesce(F.col("location_site_name"), F.col("asset_site_name")))
    .withColumn("days_since_last_service", F.datediff(F.col("event_date"), F.col("last_service_date")))
    .withColumn(
        "maintenance_risk_score",
        F.round(
            F.least(
                F.lit(100.0),
                (F.col("error_events") * F.lit(12.0))
                + (F.greatest(F.col("avg_temperature_c") - F.lit(75.0), F.lit(0.0)) * F.lit(1.25))
                + (
                    F.greatest(F.col("avg_vibration_mm_s") - F.lit(7.0), F.lit(0.0))
                    * F.lit(8.0)
                )
                + (F.col("case_count") * F.lit(0.8))
                + (
                    F.greatest(
                        F.col("days_since_last_service") - F.col("service_interval_days"),
                        F.lit(0),
                    )
                    * F.lit(0.7)
                ),
            ),
            2,
        ),
    )
    .withColumn(
        "service_needed_flag",
        (
            (F.col("maintenance_risk_score") >= F.lit(60.0))
            | (F.col("error_events") >= F.lit(4))
            | (F.col("max_temperature_c") >= F.lit(90.0))
            | (F.col("max_vibration_mm_s") >= F.lit(9.0))
        ),
    )
)

target_table = f"{CATALOG}.{SCHEMA}.gold_eugene_maintenance_kpis"
(
    kpis.write.format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(target_table)
)

print(f"Wrote {kpis.count()} rows to {target_table}")
