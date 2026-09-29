from typing import Literal

from pydantic import Field

from app.financial.models import FinancialSchema
from app.schemas.model import ModelCalculateRequest

HistoricalKey = Literal["revenue", "cogs", "ebitda", "cash", "accounts_receivable", "inventory", "accounts_payable", "ppe", "debt", "shareholders_equity"]
Origin = Literal["SOURCE", "MANUAL", "CALCULATED", "DERIVED", "CONVENTION"]


class InputProvenance(FinancialSchema):
    origin: Literal["SOURCE", "MANUAL", "DERIVED"]
    provider: str | None = Field(default=None, max_length=80)
    source: str | None = Field(default=None, max_length=160)


class TraceRequest(ModelCalculateRequest):
    metric_key: str = Field(min_length=1, max_length=80)
    year: int | None = Field(default=None, ge=1, le=5, strict=True)
    historical_provenance: dict[HistoricalKey, InputProvenance] = Field(default_factory=dict)


class TraceReference(FinancialSchema):
    metric_key: str
    label: str
    year: int | None = None


class TraceInput(TraceReference):
    value: float | None
    unit: Literal["millions", "percent", "multiple", "days", "years"] = "millions"
    origin: Origin
    provider: str | None = None
    source: str | None = None


class TraceNode(TraceReference):
    value: float | None
    unit: Literal["millions", "percent", "multiple"] = "millions"
    formula: str
    description: str
    inputs: tuple[TraceInput, ...]
    dependencies: tuple[TraceReference, ...]
    provenance: tuple[TraceInput, ...]
    downstream_metrics: tuple[TraceReference, ...]
    notes: tuple[str, ...]
