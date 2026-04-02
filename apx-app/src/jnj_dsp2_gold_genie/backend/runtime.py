from databricks.sdk import WorkspaceClient

from .config import AppConfig
from .lakebase import LakebasePool
from .logger import logger


class Runtime:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self._lakebase: LakebasePool | None = None

    @property
    def ws(self) -> WorkspaceClient:
        # note - this workspace client is usually an SP-based client
        # in development it usually uses the DATABRICKS_CONFIG_PROFILE
        return WorkspaceClient()

    @property
    def lakebase(self) -> LakebasePool:
        if self._lakebase is None:
            logger.info("Initializing Lakebase connection pool...")
            self._lakebase = LakebasePool(self.config, self.ws)
        return self._lakebase

    def close(self) -> None:
        if self._lakebase is not None:
            self._lakebase.close()
