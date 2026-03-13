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
    catalog: str = Field(default="bx4")
    schema_name: str = Field(default="dsp2")
    warehouse_id: str = Field(default="")
    genie_space_id: str = Field(default="")
    llm_endpoint_name: str = Field(default="databricks-gpt-5-4")
    preview_limit_default: int = Field(default=100)

    @property
    def static_assets_path(self) -> Path:
        return Path(str(resources.files(app_slug))).joinpath("__dist__")
