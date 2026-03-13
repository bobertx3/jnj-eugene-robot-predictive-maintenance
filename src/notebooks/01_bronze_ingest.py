# Databricks notebook source
from pyspark.sql import DataFrame


def get_param(name: str, default: str) -> str:
    try:
        return dbutils.widgets.get(name)  # type: ignore[name-defined]
    except Exception:
        return default


try:
    dbutils.widgets.text("catalog", "bx4")  # type: ignore[name-defined]
    dbutils.widgets.text("schema", "dsp2")  # type: ignore[name-defined]
    dbutils.widgets.text("volume", "raw_landing")  # type: ignore[name-defined]
except Exception:
    pass

CATALOG = get_param("catalog", "bx4")
SCHEMA = get_param("schema", "dsp2")
VOLUME = get_param("volume", "raw_landing")

BASE_VOLUME_PATH = f"/Volumes/{CATALOG}/{SCHEMA}/{VOLUME}"

SOURCE_TO_BRONZE = {
    "eugene_robot_telemetry.csv": "bronze_eugene_robot_telemetry",
    "eugene_surgery_cases.csv": "bronze_eugene_surgery_cases",
    "eugene_robot_assets.csv": "bronze_eugene_robot_assets",
}


def load_csv(csv_path: str) -> DataFrame:
    return (
        spark.read.format("csv")
        .option("header", "true")
        .option("inferSchema", "true")
        .load(csv_path)
    )


spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")

for source_file, bronze_table in SOURCE_TO_BRONZE.items():
    source_path = f"{BASE_VOLUME_PATH}/{source_file}"
    target_table = f"{CATALOG}.{SCHEMA}.{bronze_table}"

    df = load_csv(source_path)
    (
        df.write.format("delta")
        .mode("overwrite")
        .option("overwriteSchema", "true")
        .saveAsTable(target_table)
    )

    print(f"Wrote {df.count()} rows to {target_table} from {source_path}")
