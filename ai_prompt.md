You are a Databricks solution architect and engineer. Create a simple but realistic predictive maintenance demo on Databricks for a customer, based on telemetry from the Johnson & Johnson OTTAVA surgical robot (note: use BOTTAVA as the robot name in the deliverables unless otherwise specified).

Objective:
Build a customer-facing Databricks demo that shows how telemetry data from a surgical robot can be ingested, refined through a bronze-silver-gold architecture, and used to support predictive maintenance insights. Keep the scope intentionally simple and demo-friendly.
Use Databricks Asset Bundles and keep everything easy to demo.

## Goal

Build a customer-facing BOTTAVA predictive maintenance demo on Databricks that:
- Ingests CSV telemetry/case/asset data from a Unity Catalog volume
- Builds Bronze -> Silver -> Gold tables
- Trains and registers a simple predictive maintenance model in Unity Catalog
- Produces batch ML predictions
- Exposes insights in a Databricks AI/BI dashboard
- Enables natural language analytics with a Genie space

## Environment and naming

Use these defaults unless overridden during development:
- `CATALOG=bx4`
- `SCHEMA=dsp2`
- `VOLUME=raw_landing`
- `WAREHOUSE_ID=6ebfe102e1ecba75`

Bundle:
- Name: `jnj-dsp2`
- Targets: `prod`
- Main medallion + ML job name: `jnj-bottava_predictive_maintenance`
- Dashboard display name: `BOTTAVA Predictive Maintenance`

## Expected repo areas to build

- `databricks.yml`
- `resources/jobs.yml`
- `resources/dashboards.yml`
- `src/notebooks/01_bronze_ingest.py`
- `src/notebooks/02_silver_transform.py`
- `src/notebooks/03_gold_kpis.py`
- `src/ml/00_skip_ml_training.py`
- `src/ml/01_train_register_risk_model.py`
- `src/ml/02_batch_inference.py`
- `src/dashboards/bottava_gold_dashboard.lvdash.json`
- `src/scripts/generate_synthetic_data.py`
- `src/scripts/upload_synthetic_to_volume.py`
- `src/scripts/create_genie_space.py`
- `src/genie/bottava_genie_space.template.json`
- `data/schemas/*`

## Step 1 - Data Engineering

Build a simple medallion architecture for BOTTAVA maintenance telemetry.

### 1.1 Synthetic source data
- CSVs are already located in the volume
  - `bottava_robot_telemetry.csv`
  - `bottava_surgery_cases.csv`
  - `bottava_robot_assets.csv`
- Analyze the data before building the pipelines

### 1.3 Bronze notebook
- Read CSVs from volume with header/inferSchema.
- Write overwrite Delta tables:
  - `bronze_bottava_robot_telemetry`
  - `bronze_bottava_surgery_cases`
  - `bronze_bottava_robot_assets`

### 1.4 Silver notebook
- Cast and standardize key columns.
- Trim identifiers and enforce basic quality filters (null key removal).
- Write overwrite Delta tables:
  - `silver_bottava_robot_telemetry`
  - `silver_bottava_surgery_cases`
  - `silver_bottava_robot_assets`

### 1.5 Gold notebook
- Create `gold_bottava_maintenance_kpis` as robot-component-day level KPIs.
- Include:
  - Event and error counts
  - Temperature/vibration aggregates
  - Case utilization joins
  - Site metadata joins
  - Rules-based `maintenance_risk_score`
  - Boolean `service_needed_flag` threshold

### 1.6 Orchestration job
- Define `resources/jobs.yml` multi-task job:
  - Bronze -> Silver -> Gold
  - Conditional ML training gate (`run_ml_training` parameter)
  - Run batch inference after either training or skip branch
  - Use serverless job compute

## Step 2 - Genie

Create a Genie space for natural language analysis on the Gold dataset.

### 2.1 Genie source table
- Use `bldemos.robot_health.gold_bottava_maintenance_kpis` (or env-substituted catalog/schema).

### 2.2 Provisioning script
- Add `src/scripts/create_genie_space.py` that calls Databricks API:
  - `POST /api/2.0/data-rooms/`
- Include:
  - Display name: `BOTTAVA Maintenance Analyst`
  - Description
  - Warehouse ID
  - Gold table identifier
  - 3-5 sample maintenance questions

## Step 3 - Dashboards

Build a Databricks AI/BI dashboard resource from JSON.

### 3.1 Resource config
- In `resources/dashboards.yml`, define:
  - Key: `bottava_gold_dashboard`
  - Display name: `BOTTAVA Predictive Maintenance`
  - File path to `src/dashboards/demo_bottava_gold_dashboard.lvdash.json`
  - Warehouse ID variable
  - Dataset catalog/schema variables
  - `users` group with `CAN_RUN`

### 3.2 Dashboard datasets and visuals
Use Gold + ML prediction tables:
- `gold_bottava_maintenance_kpis`
- `gold_bottava_maintenance_risk_ml`

Include at least:
- KPI counters:
  - Robots observed
  - Risk (rules based)
  - Risk (ML based %)
- Risk trend line by day
- Component hotspot bar chart (error events)
- Service queue table (rows where rule or ML indicates maintenance need)

### 3.3 Dashboard narrative
- Add a subtitle panel that explains:
  - Rules-based risk logic
  - ML risk probability meaning
  - Label used for model training

## Step 4 - ML (Predictive Maintenance)

Build a simple but realistic ML pipeline using MLflow + Unity Catalog model registry.

### 4.1 Training dataset
- Create `ml_bottava_training_data` from Gold KPIs.
- Define label:
  - `needs_maintenance_label = 1 when error_events > 3 else 0`
- Keep feature set compact:
  - Error count
  - Temperature aggregates
  - Vibration aggregates
  - Case count and duration

### 4.2 Train and select model
- Train at least two candidate classifiers (for example Logistic Regression and Random Forest).
- Log metrics to MLflow (accuracy, f1, roc_auc).
- Pick winner by highest ROC-AUC.

### 4.3 Register model
- Register as:
  - `<catalog>.<schema>.bottava_maintenance_risk_model`
- Set alias:
  - `Champion` -> latest winning version

### 4.4 Batch inference
- Load model via:
  - `models:/<catalog>.<schema>.bottava_maintenance_risk_model@Champion`
- Score Gold KPI rows.
- Write predictions table:
  - `gold_bottava_maintenance_risk_ml`
- Include:
  - `risk_ml_probability`
  - `risk_ml_flag`
  - `prediction_run_ts`

## Deployment flow to implement

1. Validate bundle, deploy bundle and all pre-reqs

## Acceptance criteria

Return your implementation summary in exactly four sections:
1. Data Engineering
2. Genie
3. Dashboards
4. ML

In each section include:
- What you built
- Key files created/updated
- Commands run
- Validation checks
