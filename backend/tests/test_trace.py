import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.trace import TraceRequest
from app.services.trace_service import ANNUAL, GLOBAL, trace_model
from app.financial import run_lbo_model
from test_model_api import payload

@pytest.mark.parametrize("key,year,formula,deps", [
 ("revenue",1,"Prior Year Revenue × (1 + Revenue Growth)",["historical.revenue","operating_assumptions.revenue_growth_rate"]),
 ("ebitda",5,"Revenue × EBITDA Margin",["revenue","operating_assumptions.ebitda_margin"]),
 ("interest_expense",3,"Beginning Debt × Interest Rate",["beginning_debt","transaction_assumptions.interest_rate"]),
 ("cfads",4,"Net Income + Depreciation − Change in NWC − CapEx",["net_income","depreciation","change_in_nwc","capex"]),
 ("ending_debt",5,"Beginning Debt − Mandatory Debt Paydown − Optional Debt Paydown",["beginning_debt","mandatory_debt_paydown","optional_debt_paydown"]),
 ("exit_equity",None,"Exit Enterprise Value − Year 5 Ending Debt",["exit_enterprise_value","ending_debt"]),
 ("moic",None,"Exit Equity / Initial Equity",["exit_equity","initial_equity"]),
 ("irr",None,"(Exit Equity / Initial Equity)^(1 / Holding Period) − 1",["exit_equity","initial_equity","convention.holding_period"]),
])
def test_trace_matches_model_formula_dependencies(payload,key,year,formula,deps):
 request=TraceRequest(**payload,metric_key=key,year=year)
 trace=trace_model(request)
 result=run_lbo_model(request.historical,request.transaction_assumptions,request.operating_assumptions)
 expected=getattr(result.projected_years[year-1],key) if year else getattr(result.returns,key)
 assert trace.value==expected
 assert trace.formula==formula
 assert [i.metric_key for i in trace.dependencies]==deps
 assert [i.metric_key for i in trace.inputs]==deps
 assert all(i.origin in {"CALCULATED","MANUAL","CONVENTION"} for i in trace.inputs)

@pytest.mark.parametrize("key",list(ANNUAL))
def test_all_annual_metrics_and_years_resolve(payload,key):
 for year in range(1,6):
  request=TraceRequest(**payload,metric_key=key,year=year)
  result=run_lbo_model(request.historical,request.transaction_assumptions,request.operating_assumptions)
  trace=trace_model(request)
  assert trace.value==getattr(result.projected_years[year-1],key)
  assert all(i.year is None or 1<=i.year<=5 for i in trace.inputs)

@pytest.mark.parametrize("key",list(GLOBAL))
def test_global_values(payload,key):
 request=TraceRequest(**payload,metric_key=key)
 result=run_lbo_model(request.historical,request.transaction_assumptions,request.operating_assumptions)
 expected=getattr(result.transaction,key) if key in {"purchase_enterprise_value","initial_debt","initial_equity"} else getattr(result.returns,key)
 assert trace_model(request).value==expected

def test_golden_and_null_irr(payload):
 client=TestClient(app)
 r=client.post('/api/v1/model/trace',json={**payload,'metric_key':'ebitda','year':5})
 assert r.status_code==200
 assert r.json()['value']==pytest.approx(382.88446875)
 assert r.json()['inputs'][0]['value']==pytest.approx(1276.2815625)
 r=client.post('/api/v1/model/trace',json={**payload,'metric_key':'irr'})
 assert r.json()['value']==pytest.approx(0.1977441934779717)
 payload['operating_assumptions']['ebitda_margin']=0
 r=client.post('/api/v1/model/trace',json={**payload,'metric_key':'irr'})
 assert r.status_code==200 and r.json()['value'] is None
 assert any('Exit Equity <= 0' in n for n in r.json()['notes'])

@pytest.mark.parametrize('metric,year',[('unknown',1),('revenue',None),('ebitda',0),('ebitda',6),('irr',5),('revenue',1.5)])
def test_invalid_selection(payload,metric,year):
 assert TestClient(app).post('/api/v1/model/trace',json={**payload,'metric_key':metric,'year':year}).status_code==422

def test_source_then_manual_override_provenance(payload):
 request={**payload,'metric_key':'purchase_enterprise_value','historical_provenance':{'ebitda':{'origin':'SOURCE','provider':'yfinance','source':'EBITDA'}}}
 sourced=trace_model(TraceRequest(**request))
 assert sourced.inputs[0].origin=='SOURCE'
 payload['historical']['ebitda']=450
 request['historical_provenance']['ebitda']={'origin':'MANUAL'}
 manual=trace_model(TraceRequest(**request))
 assert manual.inputs[0].value==450
 assert manual.inputs[0].origin=='MANUAL'
 assert manual.inputs[0].provider is None
 assert manual.value==4500

def test_year_links_and_downstream(payload):
 def trace(key,year): return trace_model(TraceRequest(**payload,metric_key=key,year=year))
 assert trace('beginning_debt',1).dependencies[0].metric_key=='initial_debt'
 assert trace('beginning_debt',2).dependencies[0].year==1
 assert trace('prior_nwc',1).inputs[0].metric_key=='historical.accounts_receivable'
 assert trace('prior_nwc',2).inputs[0].year==1
 assert {(r.metric_key,r.year) for r in trace('ending_debt',4).downstream_metrics} >= {('beginning_debt',5)}
 assert {(r.metric_key,r.year) for r in trace('ebitda',5).downstream_metrics} >= {('ebit',5),('exit_enterprise_value',None)}

def test_client_outputs_rejected_and_inputs_immutable(payload):
 request=TraceRequest(**payload,metric_key='irr')
 before=request.model_dump()
 trace_model(request)
 assert request.model_dump()==before
 assert TestClient(app).post('/api/v1/model/trace',json={**payload,'metric_key':'irr','value':1}).status_code==422
