from importlib import resources
from pathlib import Path
from typing import ClassVar

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from .._metadata import app_name, app_slug

# project root is the parent of the src folder
project_root = Path(__file__).parent.parent.parent.parent
env_file = project_root / ".env"

if env_file.exists():
    load_dotenv(dotenv_path=env_file)


class AppConfig(BaseSettings):
    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=env_file, env_prefix=f"{app_slug.upper()}_", extra="ignore"
    )
    app_name: str = Field(default=app_name)
    catalog: str = Field(default="bldemos")
    schema_name: str = Field(default="robot_health")
    warehouse_id: str = Field(default="")
    genie_space_id: str = Field(default="")
    llm_endpoint_name: str = Field(default="databricks-gpt-5-4")
    preview_limit_default: int = Field(default=100)

    # Lakebase config
    lakebase_instance_name: str = Field(default="robots-db")
    lakebase_host: str = Field(default="ep-solitary-sun-d2n7gz4r.database.us-east-1.cloud.databricks.com")
    lakebase_database: str = Field(default="databricks_postgres")
    lakebase_schema: str = Field(default="robot_health")
    # Postgres table names for the synced gold tables
    lakebase_kpis_table: str = Field(default="lakebase_gold_kpis")
    lakebase_risk_ml_table: str = Field(default="lakebase_gold_risk_ml")
    # Native PG credentials (optional — falls back to OAuth if not set)
    lakebase_pg_user: str = Field(default="")
    lakebase_pg_password: str = Field(default="")

    @property
    def static_assets_path(self) -> Path:
        return Path(str(resources.files(app_slug))).joinpath("__dist__")
