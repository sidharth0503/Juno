from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.financial.models import HistoricalFinancials, OperatingAssumptions, TransactionAssumptions
from app.financial.sensitivity import DEFAULT_MULTIPLES, MultipleAxis


class ModelCalculateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    historical: HistoricalFinancials
    transaction_assumptions: TransactionAssumptions
    operating_assumptions: OperatingAssumptions


class SensitivityRequest(ModelCalculateRequest):
    entry_multiples: MultipleAxis = DEFAULT_MULTIPLES
    exit_multiples: MultipleAxis = DEFAULT_MULTIPLES


class ExportCompany(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticker: str | None = Field(default=None, max_length=64)
    company_name: str | None = Field(default=None, max_length=200)
    currency: str | None = Field(default=None, max_length=16)
    fiscal_year: int | None = Field(default=None, ge=1900, le=9999)
    provider: str | None = Field(default=None, max_length=80)

    @field_validator("ticker", "company_name", "currency", "provider")
    @classmethod
    def xml_safe(cls, value):
        if value and any(ord(c) < 32 and c not in "\t\n\r" for c in value):
            raise ValueError("Metadata contains unsupported control characters")
        return value


class ExportRequest(SensitivityRequest):
    company: ExportCompany | None = None
