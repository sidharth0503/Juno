"""Entry/exit scenarios orchestrate the unchanged LBO engine."""
from typing import Annotated

from pydantic import Field

from app.financial.engine import run_lbo_model
from app.financial.models import FinancialSchema, HistoricalFinancials, OperatingAssumptions, TransactionAssumptions

Multiple = Annotated[float, Field(gt=0, allow_inf_nan=False)]
MultipleAxis = Annotated[tuple[Multiple, ...], Field(min_length=1, max_length=10)]
DEFAULT_MULTIPLES = (8.0, 9.0, 10.0, 11.0, 12.0)


class SensitivityGrid(FinancialSchema):
    entry_multiples: MultipleAxis = DEFAULT_MULTIPLES
    exit_multiples: MultipleAxis = DEFAULT_MULTIPLES


class SensitivityCell(FinancialSchema):
    entry_multiple: float
    exit_multiple: float
    irr: float | None
    moic: float
    exit_equity: float
    ending_debt: float


class SensitivityBaseCase(FinancialSchema):
    entry_multiple: float
    exit_multiple: float
    row_index: int | None
    column_index: int | None


class SensitivityResult(SensitivityGrid):
    matrix: tuple[tuple[SensitivityCell, ...], ...]
    base_case: SensitivityBaseCase
    warnings: tuple[str, ...]


def run_sensitivity_analysis(
    historical: HistoricalFinancials,
    transaction_assumptions: TransactionAssumptions,
    operating_assumptions: OperatingAssumptions,
    entry_multiples=DEFAULT_MULTIPLES,
    exit_multiples=DEFAULT_MULTIPLES,
) -> SensitivityResult:
    """Rows are entry multiples; columns are exit multiples, in caller order.

    Validate the public Python boundary as well as HTTP input. Every cell invokes
    the full model. Duplicate axis values are retained, with the first exact base
    match identified by indices; no grid values are inserted or reordered.
    """
    grid = SensitivityGrid(entry_multiples=entry_multiples, exit_multiples=exit_multiples)
    matrix, warnings = [], []
    for entry in grid.entry_multiples:
        row = []
        for exit_ in grid.exit_multiples:
            assumptions = TransactionAssumptions.model_validate({
                **transaction_assumptions.model_dump(),
                "purchase_multiple_ev_ebitda": entry, "exit_multiple": exit_,
            })
            result = run_lbo_model(historical, assumptions, operating_assumptions)
            row.append(SensitivityCell(entry_multiple=entry, exit_multiple=exit_,
                irr=result.returns.irr, moic=result.returns.moic,
                exit_equity=result.returns.exit_equity, ending_debt=result.returns.exit_debt))
            for diagnostic in result.diagnostics:
                if diagnostic.message not in warnings:
                    warnings.append(diagnostic.message)
        matrix.append(tuple(row))
    entry = transaction_assumptions.purchase_multiple_ev_ebitda
    exit_ = transaction_assumptions.exit_multiple
    matched = entry in grid.entry_multiples and exit_ in grid.exit_multiples
    if not matched:
        warnings.append("Current base multiples are not both present in the grid; no base cell is highlighted.")
    return SensitivityResult(**grid.model_dump(), matrix=tuple(matrix), warnings=tuple(warnings),
        base_case=SensitivityBaseCase(entry_multiple=entry, exit_multiple=exit_,
            row_index=grid.entry_multiples.index(entry) if matched else None,
            column_index=grid.exit_multiples.index(exit_) if matched else None))
