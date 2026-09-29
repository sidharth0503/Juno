from fastapi import APIRouter, Depends, HTTPException

from app.data.models import CompanyResponse
from app.data.providers.base import CompanyDataError
from app.services.company_service import CompanyService, get_company_service

router = APIRouter(prefix="/api/v1/company", tags=["company"])


@router.get("/{ticker}", response_model=CompanyResponse)
def company(ticker: str, service: CompanyService = Depends(get_company_service)):
    try:
        return service.get_company(ticker)
    except CompanyDataError as exc:
        raise HTTPException(status_code=exc.status, detail={"message": str(exc)}) from exc
