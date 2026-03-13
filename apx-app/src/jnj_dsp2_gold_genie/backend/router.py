import re
import os
from datetime import date, datetime
from datetime import timedelta
from typing import Annotated, Any, cast

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.iam import User as UserOut
from databricks.sdk.service.serving import ChatMessage, ChatMessageRole
from fastapi import APIRouter, Depends, HTTPException

from .._metadata import api_prefix
from .dependencies import ConfigDep, RuntimeDep, get_obo_ws
from .models import (
    ComponentHeatmapCellOut,
    ComponentHeatmapOut,
    GenieAskIn,
    GenieAskOut,
    GenieQueryResultOut,
    GoldOverviewOut,
    GoldPreviewOut,
    GoldSummaryOut,
    GoldTableOut,
    MaintenanceAiAnalysisIn,
    MaintenanceAiAnalysisOut,
    RobotComponentDetailOut,
    RobotComponentRiskOut,
    RobotMapOut,
    RobotMapPointOut,
    RobotSiteRobotOut,
    RobotWatchlistItemOut,
    RobotWatchlistOut,
    VersionOut,
)

api = APIRouter(prefix=api_prefix)

try:
    from databricks import sql as databricks_sql
except Exception:
    databricks_sql = cast(Any, None)


def _resolve_warehouse_id(config: ConfigDep) -> str:
    # Some runtimes inject empty env vars; guard against that.
    return (
        (config.warehouse_id or "").strip()
        or os.getenv("DATABRICKS_WAREHOUSE_ID", "").strip()
        or "6ebfe102e1ecba75"
    )


def _resolve_genie_space_id(config: ConfigDep) -> str:
    return (
        (config.genie_space_id or "").strip()
        or os.getenv("GENIE_SPACE_ID", "").strip()
        or "01f11eee07f71f08b14c77cbf4575ba5"
    )


def _resolve_llm_endpoint_name(config: ConfigDep) -> str:
    return (
        (config.llm_endpoint_name or "").strip()
        or os.getenv("LLM_ENDPOINT_NAME", "").strip()
        or "databricks-gpt-5-4"
    )


def _is_safe_identifier(name: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name))


def _run_sql(
    runtime: RuntimeDep, warehouse_id: str, query: str
) -> tuple[list[str], list[list[Any]]]:
    if databricks_sql is None:
        raise RuntimeError(
            "databricks-sql-connector is unavailable in this runtime."
        )
    cfg = runtime.ws.config
    connection = databricks_sql.connect(
        server_hostname=cfg.host,
        http_path=f"/sql/1.0/warehouses/{warehouse_id}",
        credentials_provider=lambda: cfg.authenticate,
    )
    with connection, connection.cursor() as cursor:
        cursor.execute(query)
        columns = [col[0] for col in (cursor.description or [])]
        rows = [list(r) for r in cursor.fetchall()]
    return columns, rows


def _to_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def _to_float(value: Any) -> float:
    try:
        return float(value or 0.0)
    except Exception:
        return 0.0


def _to_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def _to_iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def _extract_llm_text(response: Any) -> str:
    choices = getattr(response, "choices", None) or []
    if not choices:
        return "No analysis returned from model endpoint."

    first_choice = choices[0]
    message = getattr(first_choice, "message", None)
    content = getattr(message, "content", None)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text_value = item.get("text")
                if text_value:
                    parts.append(str(text_value))
        if parts:
            return "\n".join(parts).strip()
    return str(content).strip() if content else "No analysis returned from model endpoint."


@api.get("/version", response_model=VersionOut, operation_id="version")
async def version():
    return VersionOut.from_metadata()


@api.get("/current-user", response_model=UserOut, operation_id="currentUser")
def me(obo_ws: Annotated[WorkspaceClient, Depends(get_obo_ws)]):
    return obo_ws.current_user.me()


@api.get("/gold-summary", response_model=GoldSummaryOut, operation_id="goldSummary")
def gold_summary(config: ConfigDep, runtime: RuntimeDep):
    catalog = config.catalog
    schema = config.schema_name
    warehouse_id = _resolve_warehouse_id(config)
    query = f"""
    SELECT table_name
    FROM {catalog}.information_schema.tables
    WHERE table_schema = '{schema}'
      AND table_name LIKE 'gold_%'
    ORDER BY table_name
    """
    _, rows = _run_sql(runtime, warehouse_id, query)

    tables: list[GoldTableOut] = []
    for row in rows:
        table_name = str(row[0])
        count_query = f"SELECT COUNT(*) AS row_count FROM {catalog}.{schema}.{table_name}"
        _, count_rows = _run_sql(runtime, warehouse_id, count_query)
        row_count = int(count_rows[0][0]) if count_rows else 0
        tables.append(
            GoldTableOut(
                table_name=table_name,
                full_name=f"{catalog}.{schema}.{table_name}",
                row_count=row_count,
            )
        )
    return GoldSummaryOut(catalog=catalog, schema_name=schema, tables=tables)


@api.get("/gold-overview", response_model=GoldOverviewOut, operation_id="goldOverview")
def gold_overview(config: ConfigDep, runtime: RuntimeDep):
    catalog = config.catalog
    schema = config.schema_name
    warehouse_id = _resolve_warehouse_id(config)
    kpis_table = f"{catalog}.{schema}.gold_eugene_maintenance_kpis"
    risk_table = f"{catalog}.{schema}.gold_eugene_maintenance_risk_ml"

    kpis_query = f"""
    SELECT
      COUNT(DISTINCT robot_id) AS total_robots,
      COUNT(DISTINCT component_id) AS total_components,
      ROUND(AVG(maintenance_risk_score), 2) AS avg_risk_score,
      SUM(CASE WHEN service_needed_flag THEN 1 ELSE 0 END) AS service_needed_count,
      ROUND(100.0 * AVG(CASE WHEN service_needed_flag THEN 1.0 ELSE 0.0 END), 2) AS service_needed_rate_pct
    FROM {kpis_table}
    """
    _, kpis_rows = _run_sql(runtime, warehouse_id, kpis_query)
    kpis = kpis_rows[0] if kpis_rows else [0, 0, 0.0, 0, 0.0]

    ml_query = f"""
    SELECT
      ROUND(AVG(risk_ml_probability), 4) AS avg_ml_risk_probability,
      SUM(CASE WHEN risk_ml_flag THEN 1 ELSE 0 END) AS high_ml_risk_count
    FROM {risk_table}
    """
    _, ml_rows = _run_sql(runtime, warehouse_id, ml_query)
    ml = ml_rows[0] if ml_rows else [0.0, 0]

    return GoldOverviewOut(
        total_robots=int(kpis[0] or 0),
        total_components=int(kpis[1] or 0),
        avg_risk_score=float(kpis[2] or 0.0),
        service_needed_count=int(kpis[3] or 0),
        service_needed_rate_pct=float(kpis[4] or 0.0),
        avg_ml_risk_probability=float(ml[0] or 0.0),
        high_ml_risk_count=int(ml[1] or 0),
    )


@api.get(
    "/gold-preview/{table_name}",
    response_model=GoldPreviewOut,
    operation_id="goldPreview",
)
def gold_preview(table_name: str, config: ConfigDep, runtime: RuntimeDep):
    if not _is_safe_identifier(table_name):
        raise ValueError("Invalid table name.")

    catalog = config.catalog
    schema = config.schema_name
    warehouse_id = _resolve_warehouse_id(config)
    limit = max(1, min(config.preview_limit_default, 500))
    preview_query = f"SELECT * FROM {catalog}.{schema}.{table_name} LIMIT {limit}"
    columns, rows = _run_sql(runtime, warehouse_id, preview_query)
    return GoldPreviewOut(table_name=table_name, columns=columns, rows=rows)


@api.post("/genie/ask", response_model=GenieAskOut, operation_id="genieAsk")
def genie_ask(body: GenieAskIn, config: ConfigDep, runtime: RuntimeDep):
    ws = runtime.ws
    space_id = _resolve_genie_space_id(config)

    if body.conversation_id:
        wait = ws.genie.create_message(
            space_id=space_id,
            conversation_id=body.conversation_id,
            content=body.question.strip(),
        )
    else:
        wait = ws.genie.start_conversation(
            space_id=space_id,
            content=body.question.strip(),
        )

    message = wait.result(timeout=timedelta(seconds=90))
    conversation_id = message.conversation_id or ""
    message_id = message.id or message.message_id or ""
    if not conversation_id or not message_id:
        raise ValueError("Genie did not return conversation/message IDs.")
    text_chunks: list[str] = []
    sql_text: str | None = None
    suggestions: list[str] = []
    query_result: GenieQueryResultOut | None = None

    for attachment in message.attachments or []:
        if attachment.text and attachment.text.content:
            text_chunks.append(attachment.text.content)
        if attachment.suggested_questions and attachment.suggested_questions.questions:
            suggestions.extend(attachment.suggested_questions.questions)
        if attachment.query and attachment.query.query:
            sql_text = attachment.query.query
            if attachment.attachment_id:
                result = ws.genie.get_message_query_result_by_attachment(
                    space_id=space_id,
                    conversation_id=conversation_id,
                    message_id=message_id,
                    attachment_id=attachment.attachment_id,
                )
                manifest = result.statement_response.manifest if result.statement_response else None
                if (
                    result.statement_response
                    and result.statement_response.result
                    and result.statement_response.result.data_array
                ):
                    data: list[list[Any]] = [
                        list(r) for r in result.statement_response.result.data_array
                    ]
                else:
                    data = []
                columns_source = manifest.schema.columns if manifest and manifest.schema and manifest.schema.columns else []
                columns = [str(col.name) for col in columns_source]
                query_result = GenieQueryResultOut(
                    columns=columns,
                    rows=data,
                    row_count=len(data),
                )

    status = (
        message.status.value
        if hasattr(message.status, "value")
        else str(message.status)
    )

    return GenieAskOut(
        conversation_id=conversation_id,
        message_id=message_id,
        status=status,
        text="\n\n".join(text_chunks) if text_chunks else "No text response returned.",
        sql=sql_text,
        suggested_questions=suggestions,
        query_result=query_result,
    )


@api.get("/robot-map", response_model=RobotMapOut, operation_id="robotMap")
def robot_map(config: ConfigDep, runtime: RuntimeDep):
    catalog = config.catalog
    schema = config.schema_name
    warehouse_id = _resolve_warehouse_id(config)
    kpis_table = f"{catalog}.{schema}.gold_eugene_maintenance_kpis"

    site_query = f"""
    SELECT
      site_id,
      COALESCE(site_name, 'Unknown Site') AS site_name,
      latitude,
      longitude,
      region,
      COUNT(DISTINCT robot_id) AS robot_count,
      SUM(case_count) AS case_count,
      ROUND(AVG(maintenance_risk_score), 2) AS avg_risk_score
    FROM {kpis_table}
    WHERE site_id IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    GROUP BY site_id, site_name, latitude, longitude, region
    ORDER BY site_name
    """
    _, site_rows = _run_sql(runtime, warehouse_id, site_query)

    robot_query = f"""
    WITH robot_rollup AS (
      SELECT
        site_id,
        robot_id,
        ROUND(AVG(maintenance_risk_score), 2) AS avg_risk_score,
        ROUND(100.0 * AVG(CASE WHEN service_needed_flag THEN 1.0 ELSE 0.0 END), 1) AS service_needed_rate_pct,
        SUM(case_count) AS case_count
      FROM {kpis_table}
      WHERE site_id IS NOT NULL
      GROUP BY site_id, robot_id
    ),
    top_component AS (
      SELECT
        robot_id,
        component_type,
        ROW_NUMBER() OVER (
          PARTITION BY robot_id
          ORDER BY AVG(maintenance_risk_score) DESC
        ) AS rn
      FROM {kpis_table}
      GROUP BY robot_id, component_type
    )
    SELECT
      rr.site_id,
      rr.robot_id,
      rr.case_count,
      rr.avg_risk_score,
      rr.service_needed_rate_pct,
      tc.component_type AS top_risk_component
    FROM robot_rollup rr
    LEFT JOIN top_component tc
      ON rr.robot_id = tc.robot_id
     AND tc.rn = 1
    ORDER BY rr.avg_risk_score DESC
    """
    _, robot_rows = _run_sql(runtime, warehouse_id, robot_query)

    robots_by_site: dict[str, list[RobotSiteRobotOut]] = {}
    for row in robot_rows:
        site_id = str(row[0])
        avg_risk = _to_float(row[3])
        service_rate = _to_float(row[4])
        risk_summary = (
            "Near-term intervention recommended."
            if service_rate >= 50 or avg_risk >= 70
            else "Monitor in upcoming maintenance window."
        )
        robots_by_site.setdefault(site_id, []).append(
            RobotSiteRobotOut(
                robot_id=str(row[1]),
                case_count=_to_int(row[2]),
                avg_risk_score=avg_risk,
                service_needed_rate_pct=service_rate,
                top_risk_component=_to_str(row[5]),
                risk_summary=risk_summary,
            )
        )

    points = [
        RobotMapPointOut(
            site_id=str(row[0]),
            site_name=str(row[1]),
            latitude=_to_float(row[2]),
            longitude=_to_float(row[3]),
            region=_to_str(row[4]),
            robot_count=_to_int(row[5]),
            case_count=_to_int(row[6]),
            avg_risk_score=_to_float(row[7]),
            robots=robots_by_site.get(str(row[0]), []),
        )
        for row in site_rows
    ]
    return RobotMapOut(points=points)


@api.get(
    "/robot-watchlist",
    response_model=RobotWatchlistOut,
    operation_id="robotWatchlist",
)
def robot_watchlist(config: ConfigDep, runtime: RuntimeDep):
    catalog = config.catalog
    schema = config.schema_name
    warehouse_id = _resolve_warehouse_id(config)
    kpis_table = f"{catalog}.{schema}.gold_eugene_maintenance_kpis"

    query = f"""
    SELECT
      robot_id,
      MAX(site_name) AS site_name,
      ROUND(AVG(maintenance_risk_score), 2) AS avg_risk_score,
      ROUND(100.0 * AVG(CASE WHEN service_needed_flag THEN 1.0 ELSE 0.0 END), 1) AS service_needed_rate_pct,
      SUM(CASE WHEN maintenance_risk_score >= 70 OR service_needed_flag THEN 1 ELSE 0 END) AS high_risk_component_count,
      CAST(MAX(last_case_start_ts) AS STRING) AS last_case_ts,
      MAX(last_case_procedure_type) AS last_case_procedure
    FROM {kpis_table}
    GROUP BY robot_id
    ORDER BY service_needed_rate_pct DESC, avg_risk_score DESC
    LIMIT 20
    """
    _, rows = _run_sql(runtime, warehouse_id, query)

    robots: list[RobotWatchlistItemOut] = []
    for row in rows:
        avg_risk = _to_float(row[2])
        service_rate = _to_float(row[3])
        recommendation = (
            "Escalate to engineering lead and schedule immediate service."
            if avg_risk >= 80 or service_rate >= 70
            else "Schedule preventive maintenance in the next operating window."
            if avg_risk >= 60 or service_rate >= 40
            else "Continue monitoring with standard cadence."
        )
        robots.append(
            RobotWatchlistItemOut(
                robot_id=str(row[0]),
                site_name=_to_str(row[1]),
                avg_risk_score=avg_risk,
                service_needed_rate_pct=service_rate,
                high_risk_component_count=_to_int(row[4]),
                last_case_ts=_to_str(row[5]),
                last_case_procedure=_to_str(row[6]),
                recommendation=recommendation,
            )
        )

    return RobotWatchlistOut(robots=robots)


@api.get(
    "/component-heatmap",
    response_model=ComponentHeatmapOut,
    operation_id="componentHeatmap",
)
def component_heatmap(config: ConfigDep, runtime: RuntimeDep):
    catalog = config.catalog
    schema = config.schema_name
    warehouse_id = _resolve_warehouse_id(config)
    kpis_table = f"{catalog}.{schema}.gold_eugene_maintenance_kpis"
    query = f"""
    SELECT
      component_type,
      ROUND(AVG(maintenance_risk_score), 2) AS avg_risk_score,
      ROUND(100.0 * AVG(CASE WHEN service_needed_flag THEN 1.0 ELSE 0.0 END), 1) AS service_needed_rate_pct,
      COUNT(DISTINCT CASE WHEN maintenance_risk_score >= 70 OR service_needed_flag THEN robot_id END) AS high_risk_robots
    FROM {kpis_table}
    GROUP BY component_type
    ORDER BY avg_risk_score DESC
    """
    _, rows = _run_sql(runtime, warehouse_id, query)
    cells = [
        ComponentHeatmapCellOut(
            component_type=str(row[0]),
            avg_risk_score=_to_float(row[1]),
            service_needed_rate_pct=_to_float(row[2]),
            high_risk_robots=_to_int(row[3]),
        )
        for row in rows
    ]
    return ComponentHeatmapOut(cells=cells)


@api.get(
    "/robot-component-detail/{robot_id}",
    response_model=RobotComponentDetailOut,
    operation_id="robotComponentDetail",
)
def robot_component_detail(robot_id: str, config: ConfigDep, runtime: RuntimeDep):
    if not re.fullmatch(r"[A-Za-z0-9_-]+", robot_id):
        raise HTTPException(status_code=400, detail="Invalid robot ID.")

    catalog = config.catalog
    schema = config.schema_name
    warehouse_id = _resolve_warehouse_id(config)
    kpis_table = f"{catalog}.{schema}.gold_eugene_maintenance_kpis"
    escaped_robot_id = robot_id.replace("'", "''")

    robot_query = f"""
    SELECT
      robot_id,
      MAX(site_name) AS site_name,
      MAX(last_case_start_ts) AS last_case_ts,
      MAX(last_case_procedure_type) AS last_case_procedure,
      MAX(last_case_outcome) AS last_case_outcome
    FROM {kpis_table}
    WHERE robot_id = '{escaped_robot_id}'
    GROUP BY robot_id
    """
    _, robot_rows = _run_sql(runtime, warehouse_id, robot_query)
    if not robot_rows:
        raise HTTPException(status_code=404, detail="Robot not found.")

    component_query = f"""
    SELECT
      component_type,
      ROUND(AVG(maintenance_risk_score), 2) AS avg_risk_score,
      ROUND(100.0 * AVG(CASE WHEN service_needed_flag THEN 1.0 ELSE 0.0 END), 1) AS service_needed_rate_pct,
      SUM(error_events) AS error_events,
      CAST(MAX(event_date) AS STRING) AS latest_event_ts
    FROM {kpis_table}
    WHERE robot_id = '{escaped_robot_id}'
    GROUP BY component_type
    ORDER BY avg_risk_score DESC
    """
    _, component_rows = _run_sql(runtime, warehouse_id, component_query)

    components = [
        RobotComponentRiskOut(
            component_type=str(row[0]),
            avg_risk_score=_to_float(row[1]),
            service_needed_rate_pct=_to_float(row[2]),
            error_events=_to_int(row[3]),
            latest_event_ts=_to_str(row[4]),
        )
        for row in component_rows
    ]

    head = robot_rows[0]
    return RobotComponentDetailOut(
        robot_id=str(head[0]),
        site_name=_to_str(head[1]),
        last_case_ts=_to_iso(head[2]),
        last_case_procedure=_to_str(head[3]),
        last_case_outcome=_to_str(head[4]),
        components=components,
    )


@api.post(
    "/maintenance-ai-analysis",
    response_model=MaintenanceAiAnalysisOut,
    operation_id="maintenanceAiAnalysis",
)
def maintenance_ai_analysis(
    body: MaintenanceAiAnalysisIn, config: ConfigDep, runtime: RuntimeDep
):
    catalog = config.catalog
    schema = config.schema_name
    warehouse_id = _resolve_warehouse_id(config)
    llm_endpoint = _resolve_llm_endpoint_name(config)
    kpis_table = f"{catalog}.{schema}.gold_eugene_maintenance_kpis"
    robot_id = (body.robot_id or "").strip()
    component_type = (body.component_type or "").strip()

    if robot_id and not re.fullmatch(r"[A-Za-z0-9_-]+", robot_id):
        raise HTTPException(status_code=400, detail="Invalid robot ID.")
    if component_type and not re.fullmatch(r"[A-Za-z0-9_]+", component_type):
        raise HTTPException(status_code=400, detail="Invalid component type.")

    fleet_query = f"""
    SELECT
      ROUND(100.0 * AVG(CASE WHEN service_needed_flag THEN 1.0 ELSE 0.0 END), 1) AS fleet_service_needed_rate_pct,
      ROUND(AVG(maintenance_risk_score), 1) AS fleet_avg_risk_score,
      COUNT(DISTINCT robot_id) AS robots_covered
    FROM {kpis_table}
    """
    _, fleet_rows = _run_sql(runtime, warehouse_id, fleet_query)
    fleet_row = fleet_rows[0] if fleet_rows else [0.0, 0.0, 0]

    top_components_query = f"""
    SELECT
      component_type,
      ROUND(100.0 * AVG(CASE WHEN service_needed_flag THEN 1.0 ELSE 0.0 END), 1) AS service_needed_rate_pct,
      ROUND(AVG(maintenance_risk_score), 1) AS avg_risk_score
    FROM {kpis_table}
    GROUP BY component_type
    ORDER BY service_needed_rate_pct DESC, avg_risk_score DESC
    LIMIT 3
    """
    _, top_component_rows = _run_sql(runtime, warehouse_id, top_components_query)

    robot_context_text = "No specific robot selected."
    component_context_text = "No specific component selected."
    if robot_id:
        escaped_robot_id = robot_id.replace("'", "''")
        robot_query = f"""
        SELECT
          robot_id,
          MAX(site_name) AS site_name,
          ROUND(100.0 * AVG(CASE WHEN service_needed_flag THEN 1.0 ELSE 0.0 END), 1) AS service_needed_rate_pct,
          ROUND(AVG(maintenance_risk_score), 1) AS avg_risk_score,
          MAX(last_case_start_ts) AS last_case_ts,
          MAX(last_case_procedure_type) AS last_case_procedure
        FROM {kpis_table}
        WHERE robot_id = '{escaped_robot_id}'
        GROUP BY robot_id
        """
        _, robot_rows = _run_sql(runtime, warehouse_id, robot_query)
        if robot_rows:
            row = robot_rows[0]
            robot_context_text = (
                f"Robot {row[0]} at {row[1] or 'Unknown Site'}: "
                f"service-needed rate {row[2]}%, avg risk {row[3]}, "
                f"last case {(_to_iso(row[4]) or 'N/A')} ({row[5] or 'unknown procedure'})."
            )

        components_query = f"""
        SELECT
          component_type,
          ROUND(100.0 * AVG(CASE WHEN service_needed_flag THEN 1.0 ELSE 0.0 END), 1) AS service_needed_rate_pct,
          ROUND(AVG(maintenance_risk_score), 1) AS avg_risk_score,
          SUM(error_events) AS error_events
        FROM {kpis_table}
        WHERE robot_id = '{escaped_robot_id}'
        GROUP BY component_type
        ORDER BY service_needed_rate_pct DESC, avg_risk_score DESC
        """
        _, component_rows = _run_sql(runtime, warehouse_id, components_query)
        component_lines = [
            f"- {r[0]}: service-needed {r[1]}%, avg risk {r[2]}, error events {r[3]}"
            for r in component_rows
        ]
        if component_lines:
            robot_context_text += "\nRobot component profile:\n" + "\n".join(component_lines)

    if robot_id and component_type:
        escaped_robot_id = robot_id.replace("'", "''")
        escaped_component = component_type.replace("'", "''")
        specific_component_query = f"""
        SELECT
          component_type,
          ROUND(100.0 * AVG(CASE WHEN service_needed_flag THEN 1.0 ELSE 0.0 END), 1) AS service_needed_rate_pct,
          ROUND(AVG(maintenance_risk_score), 1) AS avg_risk_score,
          SUM(error_events) AS error_events
        FROM {kpis_table}
        WHERE robot_id = '{escaped_robot_id}'
          AND component_type = '{escaped_component}'
        GROUP BY component_type
        """
        _, selected_component_rows = _run_sql(runtime, warehouse_id, specific_component_query)
        if selected_component_rows:
            r = selected_component_rows[0]
            component_context_text = (
                f"Selected component {r[0]}: service-needed {r[1]}%, "
                f"avg risk {r[2]}, error events {r[3]}."
            )

    top_components_text = "\n".join(
        [
            f"- {r[0]}: service-needed {r[1]}%, avg risk {r[2]}"
            for r in top_component_rows
        ]
    )

    user_prompt = f"""
You are an executive maintenance analyst. Create a concise analysis using the context below.

Fleet context:
- Fleet service-needed rate: {fleet_row[0]}%
- Fleet avg risk score: {fleet_row[1]}
- Robots covered: {fleet_row[2]}
- Top fleet components by maintenance pressure:
{top_components_text or "- No component data"}

Robot context:
{robot_context_text}

Focused component context:
{component_context_text}

Return output with:
1) "What this means" (2-3 bullets)
2) "Immediate actions" (3 bullets max)
3) "What to monitor next" (2 bullets max)
Keep it short, plain English, and executive-friendly.
""".strip()

    try:
        response = runtime.ws.serving_endpoints.query(
            name=llm_endpoint,
            messages=[
                ChatMessage(
                    role=ChatMessageRole.SYSTEM,
                    content="You are a pragmatic executive maintenance analyst.",
                ),
                ChatMessage(role=ChatMessageRole.USER, content=user_prompt),
            ],
            max_tokens=700,
            temperature=0.2,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to query LLM endpoint '{llm_endpoint}': {exc}",
        ) from exc

    return MaintenanceAiAnalysisOut(
        endpoint_name=llm_endpoint, analysis=_extract_llm_text(response)
    )
