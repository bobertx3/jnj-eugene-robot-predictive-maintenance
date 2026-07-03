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
    dbutils.widgets.text("schema", "bottava")  # type: ignore[name-defined]
    dbutils.widgets.text("ml_risk_threshold", "0.5")  # type: ignore[name-defined]
except Exception:
    pass

CATALOG = get_param("catalog", "bx4")
SCHEMA = get_param("schema", "bottava")
# ML probability threshold above which a component is flagged "needs maintenance".
ML_RISK_THRESHOLD = float(get_param("ml_risk_threshold", "0.5"))

MODEL_NAME = f"{CATALOG}.{SCHEMA}.bottava_maintenance_risk_model"
MODEL_URI = f"models:/{MODEL_NAME}@Champion"

SOURCE_TABLE = f"{CATALOG}.{SCHEMA}.gold_bottava_maintenance_kpis"
TARGET_TABLE = f"{CATALOG}.{SCHEMA}.gold_bottava_maintenance_risk_ml"

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
result_pdf["risk_ml_flag"] = result_pdf["risk_ml_probability"] >= ML_RISK_THRESHOLD

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

# ---------------------------------------------------------------------------
# Enrich the gold KPI table with the ML risk. ML is the ONLY "needs maintenance"
# driver: we attach risk_ml_probability/risk_ml_flag onto the KPI grain and set
# the authoritative `service_needed_flag` = risk_ml_flag (False when unscored).
# There is no rules-based scoring in this pipeline.
# ---------------------------------------------------------------------------
kpis_df = spark.table(SOURCE_TABLE)
for drop_col in ["risk_ml_probability", "risk_ml_flag"]:
    if drop_col in kpis_df.columns:
        kpis_df = kpis_df.drop(drop_col)

ml_cols = preds_df.select(
    "event_date", "robot_id", "component_id", "risk_ml_probability", "risk_ml_flag"
)

enriched = (
    kpis_df.join(ml_cols, on=["event_date", "robot_id", "component_id"], how="left")
    .withColumn(
        "service_needed_flag",
        F.coalesce(F.col("risk_ml_flag"), F.lit(False)),
    )
)

(
    enriched.write.format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(SOURCE_TABLE)
)

print(
    f"Enriched {SOURCE_TABLE} with ML risk columns; "
    f"service_needed_flag now ML-driven (threshold={ML_RISK_THRESHOLD})."
)
