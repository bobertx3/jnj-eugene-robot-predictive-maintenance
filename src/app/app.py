import os
import time
from typing import Any

import pandas as pd
import requests
import streamlit as st
from databricks import sql
from databricks.sdk.core import Config


st.set_page_config(page_title="Gold Summary + Genie Chat", layout="wide")


DEFAULT_CATALOG = os.getenv("APP_CATALOG", "bx4")
DEFAULT_SCHEMA = os.getenv("APP_SCHEMA", "dsp2")
DEFAULT_WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID", "")
DEFAULT_GENIE_SPACE_ID = os.getenv("GENIE_SPACE_ID", "")


@st.cache_resource(ttl=300)
def get_sql_connection(warehouse_id: str):
    cfg = Config()
    return sql.connect(
        server_hostname=cfg.host,
        http_path=f"/sql/1.0/warehouses/{warehouse_id}",
        credentials_provider=lambda: cfg.authenticate,
    )


def run_sql_query(warehouse_id: str, query: str) -> pd.DataFrame:
    conn = get_sql_connection(warehouse_id)
    with conn.cursor() as cursor:
        cursor.execute(query)
        rows = cursor.fetchall()
        columns = [c[0] for c in cursor.description]
    return pd.DataFrame(rows, columns=columns)


def list_gold_tables(warehouse_id: str, catalog: str, schema: str) -> pd.DataFrame:
    query = f"""
    SELECT table_name
    FROM {catalog}.information_schema.tables
    WHERE table_schema = '{schema}'
      AND table_type = 'MANAGED'
      AND table_name LIKE 'gold_%'
    ORDER BY table_name
    """
    return run_sql_query(warehouse_id, query)


def table_row_count(warehouse_id: str, catalog: str, schema: str, table_name: str) -> int:
    query = f"SELECT COUNT(*) AS row_count FROM {catalog}.{schema}.{table_name}"
    df = run_sql_query(warehouse_id, query)
    return int(df.iloc[0]["row_count"])


def preview_table(
    warehouse_id: str, catalog: str, schema: str, table_name: str, limit: int = 100
) -> pd.DataFrame:
    query = f"SELECT * FROM {catalog}.{schema}.{table_name} LIMIT {limit}"
    return run_sql_query(warehouse_id, query)


def genie_headers() -> tuple[str, dict[str, str]]:
    cfg = Config()
    host = cfg.host.rstrip("/")
    headers = cfg.authenticate()
    headers["Content-Type"] = "application/json"
    return host, headers


def parse_genie_payload(message: dict[str, Any]) -> dict[str, Any]:
    text_chunks: list[str] = []
    sql_text: str | None = None
    suggestions: list[str] = []

    for attachment in message.get("attachments", []):
        if "text" in attachment and attachment["text"].get("content"):
            text_chunks.append(attachment["text"]["content"])
        if "query" in attachment and attachment["query"].get("query"):
            sql_text = attachment["query"]["query"]
        if "suggested_questions" in attachment:
            suggestions.extend(attachment["suggested_questions"].get("questions", []))

    return {
        "status": message.get("status", "UNKNOWN"),
        "text": "\n\n".join(text_chunks) if text_chunks else "No text response returned.",
        "sql": sql_text,
        "suggestions": suggestions,
    }


def ask_genie(space_id: str, question: str, conversation_id: str | None = None) -> dict[str, Any]:
    host, headers = genie_headers()

    if conversation_id:
        endpoint = f"{host}/api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages"
        response = requests.post(endpoint, headers=headers, json={"content": question}, timeout=30)
    else:
        endpoint = f"{host}/api/2.0/genie/spaces/{space_id}/start-conversation"
        response = requests.post(endpoint, headers=headers, json={"content": question}, timeout=30)

    response.raise_for_status()
    payload = response.json()
    conversation_id = payload["conversation_id"]
    message_id = payload["message_id"]

    message_url = (
        f"{host}/api/2.0/genie/spaces/{space_id}/conversations/"
        f"{conversation_id}/messages/{message_id}"
    )

    deadline = time.time() + 90
    latest_message = {}
    while time.time() < deadline:
        msg_resp = requests.get(message_url, headers=headers, timeout=30)
        msg_resp.raise_for_status()
        latest_message = msg_resp.json()
        status = latest_message.get("status")
        if status in {"COMPLETED", "FAILED", "CANCELLED", "ERROR"}:
            break
        time.sleep(1.5)

    parsed = parse_genie_payload(latest_message)
    parsed["conversation_id"] = conversation_id
    return parsed


st.title("EUGENE Gold Tables + Genie")
st.caption("Summary analytics on gold tables plus conversational Q&A with Genie.")

with st.sidebar:
    st.subheader("Configuration")
    warehouse_id = st.text_input("Warehouse ID", value=DEFAULT_WAREHOUSE_ID)
    catalog = st.text_input("Catalog", value=DEFAULT_CATALOG)
    schema = st.text_input("Schema", value=DEFAULT_SCHEMA)
    genie_space_id = st.text_input("Genie Space ID", value=DEFAULT_GENIE_SPACE_ID)

tab_summary, tab_genie = st.tabs(["Gold Table Summary", "Ask Genie"])

with tab_summary:
    st.subheader("Gold tables in catalog/schema")
    if not warehouse_id:
        st.error("Set a Warehouse ID in the sidebar to load table summaries.")
    else:
        try:
            tables_df = list_gold_tables(warehouse_id, catalog, schema)
        except Exception as exc:
            st.exception(exc)
            tables_df = pd.DataFrame()

        if tables_df.empty:
            st.warning("No gold tables found for the selected catalog/schema.")
        else:
            include_counts = st.checkbox("Compute row counts", value=True)
            rows: list[dict[str, Any]] = []
            for table_name in tables_df["table_name"].tolist():
                table_info: dict[str, Any] = {
                    "table": f"{catalog}.{schema}.{table_name}",
                    "table_name": table_name,
                }
                if include_counts:
                    try:
                        table_info["row_count"] = table_row_count(
                            warehouse_id, catalog, schema, table_name
                        )
                    except Exception:
                        table_info["row_count"] = None
                rows.append(table_info)

            summary_df = pd.DataFrame(rows)
            st.dataframe(summary_df, width="stretch", hide_index=True)

            selected_table = st.selectbox("Preview table", options=tables_df["table_name"].tolist())
            preview_limit = st.slider("Preview row limit", min_value=10, max_value=500, value=100, step=10)
            try:
                preview_df = preview_table(
                    warehouse_id, catalog, schema, selected_table, limit=preview_limit
                )
                st.dataframe(preview_df, width="stretch", hide_index=True)
            except Exception as exc:
                st.exception(exc)

with tab_genie:
    st.subheader("Ask questions through Genie API")
    if "conversation_id" not in st.session_state:
        st.session_state["conversation_id"] = None
    if "chat_history" not in st.session_state:
        st.session_state["chat_history"] = []

    col1, col2 = st.columns([5, 1])
    with col1:
        question = st.text_input("Question", placeholder="Ask about maintenance trends, risks, or KPIs")
    with col2:
        ask = st.button("Ask", type="primary", use_container_width=True)

    reset = st.button("Start new conversation")
    if reset:
        st.session_state["conversation_id"] = None
        st.session_state["chat_history"] = []

    if ask:
        if not genie_space_id:
            st.error("Set a Genie Space ID in the sidebar.")
        elif not question.strip():
            st.error("Enter a question first.")
        else:
            with st.spinner("Waiting for Genie response..."):
                try:
                    result = ask_genie(
                        space_id=genie_space_id,
                        question=question.strip(),
                        conversation_id=st.session_state["conversation_id"],
                    )
                    st.session_state["conversation_id"] = result["conversation_id"]
                    st.session_state["chat_history"].append(
                        {
                            "question": question.strip(),
                            "status": result["status"],
                            "text": result["text"],
                            "sql": result.get("sql"),
                            "suggestions": result.get("suggestions", []),
                        }
                    )
                except Exception as exc:
                    st.exception(exc)

    for idx, item in enumerate(reversed(st.session_state["chat_history"]), start=1):
        st.markdown(f"**Q{idx}:** {item['question']}")
        st.write(item["text"])
        st.caption(f"Status: {item['status']}")
        if item.get("sql"):
            with st.expander("Generated SQL"):
                st.code(item["sql"], language="sql")
        if item.get("suggestions"):
            st.markdown("Suggested follow-ups:")
            for suggestion in item["suggestions"][:5]:
                st.markdown(f"- {suggestion}")
        st.divider()
