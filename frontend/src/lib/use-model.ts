"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelCalculateRequest, ModelCalculateResponse, RequestStatus } from "@/types/model";
import { calculateModel, ModelApiError } from "./api";
import { DEFAULT_REQUEST, toForm, toRequest, type InputGroup, type ModelForm } from "./model-inputs";
import type { CompanyResponse } from "@/types/company";
import { CompanyApiError, importHistorical, loadCompany } from "./company";
import { API_URL } from "./config";

import { calculateSensitivity, sensitivityRequest } from "./sensitivity";
import type { SensitivityResponse } from "@/types/sensitivity";
import { downloadWorkbook, exportRequest, fetchWorkbook } from "./export";

interface CompletedRun { result: ModelCalculateResponse; request: ModelCalculateRequest; form: ModelForm }
export function useModel() {
  const [form, setForm] = useState<ModelForm>(() => toForm(DEFAULT_REQUEST));
  const [completed, setCompleted] = useState<CompletedRun | null>(null);
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const active = useRef<AbortController | null>(null);
  const companyActive = useRef<AbortController | null>(null);
  const [ticker, setTicker] = useState("AAPL");
  const [company, setCompany] = useState<CompanyResponse | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const exportActive = useRef<AbortController | null>(null);

  const [sensitivity, setSensitivity] = useState<SensitivityResponse | null>(null);
  const [sensitivityStatus, setSensitivityStatus] = useState<RequestStatus>("idle");
  const [sensitivityError, setSensitivityError] = useState<string | null>(null);
  const sensitivityActive = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const clearSensitivity = useCallback(() => {
    sensitivityActive.current?.abort(); sensitivityActive.current = null;
    setSensitivity(null); setSensitivityStatus("idle"); setSensitivityError(null);
  }, []);
  const runSensitivity = useCallback(async (inputs: ModelForm) => {
    sensitivityActive.current?.abort();
    const controller = new AbortController(); sensitivityActive.current = controller;
    setSensitivity(null); setSensitivityStatus("calculating"); setSensitivityError(null);
    const timeout = window.setTimeout(() => controller.abort("timeout"), 15000);
    try {
      const next = await calculateSensitivity(sensitivityRequest(inputs), controller.signal);
      if (sensitivityActive.current !== controller || controller.signal.aborted) return;
      setSensitivity(next); setSensitivityStatus("ready");
    } catch (error) {
      if (sensitivityActive.current !== controller || controller.signal.aborted && controller.signal.reason !== "timeout") return;
      setSensitivityStatus("error");
      setSensitivityError(controller.signal.reason === "timeout" ? "Sensitivity timed out. Please retry."
        : error instanceof Error ? error.message : "Sensitivity failed. Please retry.");
    } finally { window.clearTimeout(timeout); }
  }, []);

  const run = useCallback(async (inputs: ModelForm) => {
    clearSensitivity();
    const inputRevision = revision.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setError(null);
    let request: ModelCalculateRequest;
    try { request = toRequest(inputs); }
    catch (error) {
      setStatus("error");
      setError(error instanceof Error ? error.message : "Check your input values.");
      return;
    }
    setStatus("calculating");
    const timeout = window.setTimeout(() => controller.abort("timeout"), 15000);
    try {
      const result = await calculateModel(request, controller.signal);
      if (active.current !== controller || controller.signal.aborted) return;
      setCompleted({ result, request, form: inputs });
      setConnected(true); setStatus("ready");
      if (revision.current === inputRevision) void runSensitivity(inputs);
    } catch (error) {
      if (active.current !== controller) return;
      if (controller.signal.aborted && controller.signal.reason !== "timeout") return;
      setStatus("error");
      setConnected(error instanceof ModelApiError ? error.status !== null : false);
      setError(controller.signal.reason === "timeout" ? "The calculation timed out. Check the backend and retry."
        : error instanceof Error ? error.message : "The calculation failed. Please retry.");
    } finally { window.clearTimeout(timeout); }
  }, [clearSensitivity, runSensitivity]);

  useEffect(() => {
    let cancelled = false;
    // Defer until the effect is established; Strict Mode cleanup cancels its first run.
    queueMicrotask(() => { if (!cancelled) void run(toForm(DEFAULT_REQUEST)); });
    return () => { cancelled = true; active.current?.abort(); companyActive.current?.abort(); sensitivityActive.current?.abort(); exportActive.current?.abort(); };
  }, [run]);

  function update(group: InputGroup, key: string, value: string) {
    setExportNotice(null);
    revision.current++; clearSensitivity();
    setForm(current => ({ ...current, [group]: { ...current[group], [key]: value } }));
    if (group === "historical") setOverrides(current => ({ ...current, [key]: true }));
  }
  function reset() {
    revision.current++; clearSensitivity();
    const defaults = toForm(DEFAULT_REQUEST);
    if (company) {
      setForm(current => ({ ...defaults, historical: current.historical }));
      setError(null);
      setStatus(completed ? "ready" : "idle");
      return;
    }
    setForm(defaults);
    void run(defaults);
  }
  async function load(requested = ticker) {
    if (!requested.trim()) { setCompanyError("Enter a ticker before loading company data."); return; }
    companyActive.current?.abort();
    const controller = new AbortController();
    companyActive.current = controller;
    setLoadingCompany(true); setCompanyError(null);
    const timeout = window.setTimeout(() => controller.abort("timeout"), 45000);
    try {
      const next = await loadCompany(API_URL, requested, controller.signal);
      if (companyActive.current !== controller || controller.signal.aborted) return;
      // Commit the replacement atomically only after a successful response.
      active.current?.abort(); active.current = null;
      revision.current++; clearSensitivity();
      setCompany(next); setTicker(next.company.ticker); setOverrides({});
      setExportNotice(null); setExportError(null);
      setForm(current => ({ ...current, historical: importHistorical(next.base_year) }));
      setCompleted(null); setStatus("idle"); setError(null); setConnected(true);
    } catch (error) {
      if (companyActive.current !== controller || controller.signal.aborted && controller.signal.reason !== "timeout") return;
      setConnected(error instanceof CompanyApiError ? error.status !== null : false);
      setCompanyError(controller.signal.reason === "timeout" ? "Company request timed out. Please retry."
        : error instanceof Error ? error.message : "Company load failed. Please retry.");
    } finally {
      window.clearTimeout(timeout);
      if (companyActive.current === controller) setLoadingCompany(false);
    }
  }
  async function exportModel() {
    if (exportActive.current) return;
    const controller = new AbortController(); exportActive.current = controller;
    setExporting(true); setExportError(null); setExportNotice(null);
    const timeout = window.setTimeout(() => controller.abort("timeout"), 30000);
    try {
      // Capture current form and company at click time; never send output arrays.
      const request = exportRequest(form, company);
      const file = await fetchWorkbook(request, controller.signal);
      if (controller.signal.aborted) return;
      downloadWorkbook(file.blob, file.filename);
      setExportNotice(`Downloaded ${file.filename} — inputs captured when export was clicked.`);
    } catch (error) {
      if (controller.signal.aborted && controller.signal.reason !== "timeout") return;
      setExportError(controller.signal.reason === "timeout" ? "Export timed out. Please retry."
        : error instanceof Error ? error.message : "Export failed. Please retry.");
    } finally { window.clearTimeout(timeout); exportActive.current = null; setExporting(false); }
  }
  return {
    exporting, exportError, exportNotice, exportModel: () => void exportModel(),
    sensitivity, sensitivityStatus, sensitivityError, retrySensitivity: () => void runSensitivity(form),
    ticker, setTicker, company, loadingCompany, companyError, overrides, load: () => void load(),
    reloadCompany: () => { if (company) void load(company.company.ticker); },
    form, update, reset, run: () => void run(form), completed, status, error, connected,
    dirty: completed !== null && JSON.stringify(form) !== JSON.stringify(completed.form),
  };
}
