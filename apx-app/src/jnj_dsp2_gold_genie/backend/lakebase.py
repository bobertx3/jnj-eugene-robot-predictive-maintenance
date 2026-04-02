"""Lakebase (Postgres) connection manager using OAuth token injection.

Uses SQLAlchemy with a do_connect event to inject fresh OAuth tokens
on each new connection — the same pattern used by production Databricks Apps.
"""

import os
import socket
import subprocess
from typing import Any

from databricks.sdk import WorkspaceClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine

from .config import AppConfig
from .logger import logger

IS_DATABRICKS_APP = bool(os.environ.get("DATABRICKS_APP_NAME"))


def _get_workspace_client() -> WorkspaceClient:
    """Get WorkspaceClient with proper auth for environment."""
    if IS_DATABRICKS_APP:
        try:
            return WorkspaceClient(auth_type="oauth-m2m")
        except Exception:
            return WorkspaceClient()
    return WorkspaceClient()


def _resolve_hostname(hostname: str) -> str | None:
    """Resolve hostname to IP. Returns None if resolution fails."""
    try:
        return socket.gethostbyname(hostname)
    except socket.gaierror:
        pass
    try:
        result = subprocess.run(
            ["dig", "+short", hostname],
            capture_output=True, text=True, timeout=5,
        )
        for line in result.stdout.strip().split("\n"):
            if line and not line.startswith(";"):
                return line
    except Exception:
        pass
    return None


class LakebasePool:
    """Manages Lakebase connections via SQLAlchemy with OAuth token injection."""

    def __init__(self, config: AppConfig, ws: WorkspaceClient):
        self._config = config
        self._instance_name = os.environ.get(
            "LAKEBASE_INSTANCE_NAME", config.lakebase_instance_name
        )
        self._host = os.environ.get("LAKEBASE_HOST", config.lakebase_host)
        self._database = config.lakebase_database
        self._schema = config.lakebase_schema

        # Determine username
        w = _get_workspace_client()
        if w.config.client_id:
            self._username = w.config.client_id
        else:
            self._username = w.current_user.me().user_name

        # Resolve IP for macOS DNS workaround
        self._hostaddr = _resolve_hostname(self._host)

        # Build connection URL (no password — injected by event listener)
        self._engine = create_engine(
            f"postgresql+psycopg://{self._username}:@{self._host}:5432/{self._database}",
            pool_recycle=45 * 60,
            pool_size=4,
            pool_pre_ping=True,
            connect_args=self._connect_args(),
        )

        # Register OAuth token injection on every new connection
        event.listen(self._engine, "do_connect", self._inject_credential)

        logger.info(
            f"Lakebase pool initialized (user='{self._username}', "
            f"instance='{self._instance_name}'): {self._host}, db={self._database}"
        )

    def _connect_args(self) -> dict:
        args: dict[str, Any] = {"sslmode": "require"}
        if self._hostaddr:
            args["hostaddr"] = self._hostaddr
        return args

    def _inject_credential(self, dialect, conn_rec, cargs, cparams):
        """SQLAlchemy do_connect event: inject fresh OAuth token as password."""
        w = _get_workspace_client()
        cred = w.database.generate_database_credential(
            instance_names=[self._instance_name]
        )
        cparams["password"] = cred.token

    def query(self, sql: str, params: tuple | None = None) -> tuple[list[str], list[list[Any]]]:
        """Execute a read query and return (columns, rows)."""
        with self._engine.connect() as conn:
            conn.execute(text(f"SET search_path TO {self._schema}, public"))
            if params:
                # Convert tuple params to dict for SQLAlchemy text() binding
                placeholders = {f"p{i}": v for i, v in enumerate(params)}
                # Replace %s with :p0, :p1, etc.
                processed_sql = sql
                for i in range(len(params)):
                    processed_sql = processed_sql.replace("%s", f":p{i}", 1)
                result = conn.execute(text(processed_sql), placeholders)
            else:
                result = conn.execute(text(sql))
            columns = list(result.keys())
            rows = [list(r) for r in result.fetchall()]
        return columns, rows

    def close(self) -> None:
        self._engine.dispose()
