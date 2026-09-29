import {test} from "node:test";
import assert from "node:assert/strict";
import {traceRequest,fetchTrace} from "../src/lib/trace.ts";
import {DEFAULT_REQUEST,toForm} from "../src/lib/model-inputs.ts";
import type {CompanyResponse} from "../src/types/company.ts";

test("trace uses current values, decimal assumptions and manual origin",()=>{
 const form=toForm(DEFAULT_REQUEST); form.historical.ebitda="450"; form.operating_assumptions.ebitda_margin="35";
 const r=traceRequest(form,null,{},"ebitda",5);
 assert.equal(r.historical.ebitda,450); assert.equal(r.operating_assumptions.ebitda_margin,0.35);
 assert.equal(r.year,5); assert.equal(r.historical_provenance.ebitda?.origin,"MANUAL");
 assert.ok(!("value" in r));
});
test("source labels are replaced by manual override provenance",()=>{
 const company={company:{provider:"yfinance"},base_year:{provenance:{ebitda:{status:"reported",source:"EBITDA"}}}} as CompanyResponse;
 const form=toForm(DEFAULT_REQUEST);
 assert.equal(traceRequest(form,company,{},"purchase_enterprise_value").historical_provenance.ebitda?.origin,"SOURCE");
 const r=traceRequest(form,company,{ebitda:true},"purchase_enterprise_value");
 assert.equal(r.historical_provenance.ebitda?.origin,"MANUAL"); assert.equal(r.historical_provenance.ebitda?.provider,null);
});
test("trace API uses selected metric and preserves null IRR",async ctx=>{
 const request=traceRequest(toForm(DEFAULT_REQUEST),null,{},"irr");
 ctx.mock.method(globalThis,"fetch",async(url:string,init:RequestInit)=>{
  assert.match(url,/model\/trace$/); assert.deepEqual(JSON.parse(String(init.body)),request);
  return Response.json({metric_key:"irr",year:null,label:"IRR",value:null,unit:"percent",formula:"Return formula",description:"Nonpositive exit",inputs:[],dependencies:[],provenance:[],downstream_metrics:[],notes:[]});
 });
 assert.equal((await fetchTrace(request)).value,null);
});
test("trace reports invalid metric and malformed response errors",async ctx=>{
 const mock=ctx.mock.method(globalThis,"fetch",async()=>Response.json({detail:{message:"Unknown trace metric."}},{status:422}));
 await assert.rejects(fetchTrace(traceRequest(toForm(DEFAULT_REQUEST),null,{},"bad")),/Unknown trace metric/);
 mock.mock.mockImplementation(async()=>Response.json({}));
 await assert.rejects(fetchTrace(traceRequest(toForm(DEFAULT_REQUEST),null,{},"irr")),/Unexpected trace response/);
});
