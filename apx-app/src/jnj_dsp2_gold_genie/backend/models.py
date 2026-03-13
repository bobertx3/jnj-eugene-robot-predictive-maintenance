from typing import Any

from pydantic import BaseModel, Field
from .. import __version__


class VersionOut(BaseModel):
    version: str

    @classmethod
    def from_metadata(cls):
        return cls(version=__version__)


class GoldTableOut(BaseModel):
    table_name: str
    full_name: str
    row_count: int | None = None


class GoldSummaryOut(BaseModel):
    catalog: str
    schema_name: str = Field(serialization_alias="schema")
    tables: list[GoldTableOut]


class GoldPreviewOut(BaseModel):
    table_name: str
    columns: list[str]
    rows: list[list[Any]]


class GoldOverviewOut(BaseModel):
    total_robots: int
    total_components: int
    avg_risk_score: float
    service_needed_count: int
    service_needed_rate_pct: float
    avg_ml_risk_probability: float
    high_ml_risk_count: int


class GenieAskIn(BaseModel):
    question: str = Field(min_length=1)
    conversation_id: str | None = None


class GenieQueryResultOut(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    row_count: int


class GenieAskOut(BaseModel):
    conversation_id: str
    message_id: str
    status: str
    text: str
    sql: str | None = None
    suggested_questions: list[str] = Field(default_factory=list)
    query_result: GenieQueryResultOut | None = None


class RobotSiteRobotOut(BaseModel):
    robot_id: str
    case_count: int
    avg_risk_score: float
    service_needed_rate_pct: float
    top_risk_component: str | None = None
    risk_summary: str


class RobotMapPointOut(BaseModel):
    site_id: str
    site_name: str
    latitude: float
    longitude: float
    region: str | None = None
    robot_count: int
    case_count: int
    avg_risk_score: float
    robots: list[RobotSiteRobotOut] = Field(default_factory=list)


class RobotMapOut(BaseModel):
    points: list[RobotMapPointOut]


class RobotWatchlistItemOut(BaseModel):
    robot_id: str
    site_name: str | None = None
    avg_risk_score: float
    service_needed_rate_pct: float
    high_risk_component_count: int
    last_case_ts: str | None = None
    last_case_procedure: str | None = None
    recommendation: str


class RobotWatchlistOut(BaseModel):
    robots: list[RobotWatchlistItemOut]


class ComponentHeatmapCellOut(BaseModel):
    component_type: str
    avg_risk_score: float
    service_needed_rate_pct: float
    high_risk_robots: int


class ComponentHeatmapOut(BaseModel):
    cells: list[ComponentHeatmapCellOut]


class RobotComponentRiskOut(BaseModel):
    component_type: str
    avg_risk_score: float
    service_needed_rate_pct: float
    error_events: int
    latest_event_ts: str | None = None


class RobotComponentDetailOut(BaseModel):
    robot_id: str
    site_name: str | None = None
    last_case_ts: str | None = None
    last_case_procedure: str | None = None
    last_case_outcome: str | None = None
    components: list[RobotComponentRiskOut] = Field(default_factory=list)


class MaintenanceAiAnalysisIn(BaseModel):
    robot_id: str | None = None
    component_type: str | None = None


class MaintenanceAiAnalysisOut(BaseModel):
    endpoint_name: str
    analysis: str
