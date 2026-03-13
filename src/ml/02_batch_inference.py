# Databricks notebook source
import mlflow
import mlflow.sklearn
import pandas as pd
from pyspark.sql import functions as F
from pyspark.sql.types import BooleanType, DoubleType, StringType, StructField, StructType


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

MODEL_NAME = f"{CATALOG}.{SCHEMA}.eugene_maintenance_risk_model"
MODEL_URI = f"models:/{MODEL_NAME}@Champion"

SOURCE_TABLE = f"{CATALOG}.{SCHEMA}.gold_eugene_maintenance_kpis"
TARGET_TABLE = f"{CATALOG}.{SCHEMA}.gold_eugene_maintenance_risk_ml"

FEATURE_COLS = [
    "error_events",
    "avg_temperature_c",
    "max_temperature_c",
    "avg_vibration_mm_s",
    "max_vibration_mm_s",
    "case_count",
    "case_duration_min_total",
    "case_duration_min_avg",
]

mlflow.set_registry_uri("databricks-uc")
model = mlflow.sklearn.load_model(MODEL_URI)

source_df = spark.table(SOURCE_TABLE).select("event_date", "robot_id", "component_id", *FEATURE_COLS)

pdf = source_df.toPandas()
X = pdf[FEATURE_COLS].fillna(0.0)

if hasattr(model, "predict_proba"):
    probs = model.predict_proba(X)[:, 1]
else:
    # Fallback for models without predict_proba support.
    probs = model.predict(X).astype(float)

result_pdf = pdf[["event_date", "robot_id", "component_id"]].copy()
result_pdf["risk_ml_probability"] = probs.astype(float)
result_pdf["risk_ml_flag"] = result_pdf["risk_ml_probability"] >= 0.6

schema = StructType(
    [
        StructField("event_date", StringType(), True),
        StructField("robot_id", StringType(), True),
        StructField("component_id", StringType(), True),
        StructField("risk_ml_probability", DoubleType(), True),
        StructField("risk_ml_flag", BooleanType(), True),
    ]
)

preds_df = spark.createDataFrame(result_pdf.astype({"event_date": str}), schema=schema).withColumn(
    "event_date", F.to_date("event_date")
)
preds_df = preds_df.withColumn("prediction_run_ts", F.current_timestamp())

(
    preds_df.write.format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(TARGET_TABLE)
)

print(f"Wrote {preds_df.count()} rows to {TARGET_TABLE} using model {MODEL_URI}")
