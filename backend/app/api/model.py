"""Thin HTTP adapter for the existing financial engine."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.financial import (
    FinancialModelError, LBOResult, run_lbo_model,
)
from app.schemas.model import ExportRequest, ModelCalculateRequest, SensitivityRequest
from app.export.excel import MIME_TYPE, build_excel, export_filename
from app.financial.sensitivity import SensitivityResult, run_sensitivity_analysis
from app.schemas.trace import TraceNode, TraceRequest
from app.services.trace_service import TraceSelectionError, trace_model

router = APIRouter(prefix="/api/v1/model", tags=["model"])


@router.post("/trace", response_model=TraceNode)
def model_trace(request: TraceRequest) -> TraceNode:
    try:
        return trace_model(request)
    except TraceSelectionError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc)}) from exc
    except FinancialModelError as exc:
        raise HTTPException(status_code=400, detail={"code": "financial_model_error", "message": str(exc)}) from exc


@router.post("/calculate", response_model=LBOResult)
def calculate_model(request: ModelCalculateRequest) -> LBOResult:
    try:
        return run_lbo_model(
            request.historical, request.transaction_assumptions,
            request.operating_assumptions,
        )
    except FinancialModelError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "financial_model_error", "message": str(exc)},
        ) from exc


@router.post("/sensitivity", response_model=SensitivityResult)
def sensitivity(request: SensitivityRequest) -> SensitivityResult:
    try:
        return run_sensitivity_analysis(request.historical, request.transaction_assumptions,
            request.operating_assumptions, request.entry_multiples, request.exit_multiples)
    except FinancialModelError as exc:
        raise HTTPException(status_code=400,
            detail={"code": "financial_model_error", "message": str(exc)}) from exc


@router.post("/export")
def export_model(request: ExportRequest) -> Response:
    try:
        content = build_excel(request)
    except FinancialModelError as exc:
        raise HTTPException(status_code=400,
            detail={"code": "financial_model_error", "message": str(exc)}) from exc
    return Response(content, media_type=MIME_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{export_filename(request)}"'})
