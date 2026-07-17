# Databricks notebook source
import os

import mlflow
import mlflow.sklearn
import pandas as pd
from mlflow.models import infer_signature
from mlflow.tracking import MlflowClient
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split


def get_param(name: str, default: str) -> str:
    try:
        return dbutils.widgets.get(name)  # type: ignore[name-defined]
    except Exception:
        return default


try:
    dbutils.widgets.text("catalog", "bx4")  # type: ignore[name-defined]
    dbutils.widgets.text("schema", "bottava")  # type: ignore[name-defined]
    dbutils.widgets.text("run_ml_training", "false")  # type: ignore[name-defined]
except Exception:
    pass

CATALOG = get_param("catalog", "bx4")
SCHEMA = get_param("schema", "bottava")
RUN_ML_TRAINING = get_param("run_ml_training", "false").lower() == "true"

MODEL_NAME = f"{CATALOG}.{SCHEMA}.bottava_maintenance_risk_model"
TRAINING_TABLE = f"{CATALOG}.{SCHEMA}.ml_bottava_training_data"
SOURCE_TABLE = f"{CATALOG}.{SCHEMA}.gold_bottava_maintenance_kpis"

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

LABEL_COL = "needs_maintenance_label"

# Multi-factor maintenance label: a component "needs maintenance" when it trips
# at least TWO independent stress conditions (errors, thermal, vibration, heavy
# utilization, or overdue service). No single feature determines the label, so the
# model must genuinely learn from the full 8-feature signal rather than echo one column.
spark.sql(
    f"""
    CREATE OR REPLACE TABLE {TRAINING_TABLE} AS
    SELECT
      robot_id,
      component_id,
      event_date,
      error_events,
      avg_temperature_c,
      max_temperature_c,
      avg_vibration_mm_s,
      max_vibration_mm_s,
      case_count,
      case_duration_min_total,
      case_duration_min_avg,
      CASE WHEN (
          CASE WHEN error_events >= 3 THEN 1 ELSE 0 END
        + CASE WHEN max_temperature_c >= 88 THEN 1 ELSE 0 END
        + CASE WHEN max_vibration_mm_s >= 10 THEN 1 ELSE 0 END
        + CASE WHEN case_duration_min_total >= 240 THEN 1 ELSE 0 END
        + CASE WHEN days_since_last_service > service_interval_days THEN 1 ELSE 0 END
      ) >= 2 THEN 1 ELSE 0 END AS {LABEL_COL}
    FROM {SOURCE_TABLE}
    """
)

if not RUN_ML_TRAINING:
    print("run_ml_training=false: skipped model training and registration.")
    dbutils.notebook.exit("SKIPPED")  # type: ignore[name-defined]

df_pd = spark.table(TRAINING_TABLE).select(*FEATURE_COLS, LABEL_COL).toPandas()
df_pd = df_pd.fillna(0.0)

X = df_pd[FEATURE_COLS]
y = df_pd[LABEL_COL].astype(int)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

username = spark.sql("SELECT current_user() AS user").first()["user"]
experiment_path = f"/Users/{username}/jnj-bottava-predictive-maintenance"

mlflow.set_registry_uri("databricks-uc")
mlflow.set_experiment(experiment_path)

candidates = {
    "logistic_regression": LogisticRegression(max_iter=2000, random_state=42),
    "random_forest": RandomForestClassifier(
        n_estimators=300, max_depth=8, min_samples_leaf=2, random_state=42
    ),
}

best = {"name": None, "roc_auc": -1.0, "run_id": None}
best_model = None

for model_name, model in candidates.items():
    with mlflow.start_run(run_name=f"bottava_{model_name}") as run:
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        probs = model.predict_proba(X_test)[:, 1]

        metrics = {
            "accuracy": float(accuracy_score(y_test, preds)),
            "f1": float(f1_score(y_test, preds, zero_division=0)),
            "roc_auc": float(roc_auc_score(y_test, probs)),
        }
        mlflow.log_params(
            {
                "model_type": model_name,
                "feature_columns": ",".join(FEATURE_COLS),
                "label_column": LABEL_COL,
            }
        )
        mlflow.log_metrics(metrics)

        signature = infer_signature(X_train, model.predict_proba(X_train))
        mlflow.sklearn.log_model(
            sk_model=model,
            artifact_path="model",
            signature=signature,
            input_example=X_train.head(3),
        )

        if metrics["roc_auc"] > best["roc_auc"]:
            best = {"name": model_name, "roc_auc": metrics["roc_auc"], "run_id": run.info.run_id}
            best_model = model

if best_model is None or best["run_id"] is None:
    raise RuntimeError("No candidate model was successfully trained.")

with mlflow.start_run(run_name=f"bottava_register_{best['name']}") as reg_run:
    mlflow.log_param("selected_model", best["name"])
    mlflow.log_metric("selected_roc_auc", best["roc_auc"])

    mlflow.sklearn.log_model(
        sk_model=best_model,
        artifact_path="model",
        signature=infer_signature(X_train, best_model.predict_proba(X_train)),
        input_example=X_train.head(3),
    )

    model_uri = f"runs:/{reg_run.info.run_id}/model"
    registered = mlflow.register_model(model_uri=model_uri, name=MODEL_NAME)
    model_version = str(registered.version)

if not model_version:
    raise RuntimeError("Model registration succeeded but version was not returned.")

client = MlflowClient()
client.set_registered_model_alias(name=MODEL_NAME, alias="Champion", version=model_version)

print(f"Registered {MODEL_NAME} version {model_version} with alias Champion")
print(f"Winning model: {best['name']} (roc_auc={best['roc_auc']:.4f})")
