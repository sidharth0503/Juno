"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";
import type { BackendStatus as Status } from "@/types/health";

const messages: Record<Status, string> = {
  checking: "Checking backend connection…",
  reachable: "Backend reachable",
  unavailable: "Backend unavailable — start the local API and refresh to retry.",
};

export function BackendStatus() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    async function checkHealth() {
      try {
        const response = await fetch(`${API_URL}/health`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Health check returned ${response.status}`);
        const body: unknown = await response.json();
        if (typeof body !== "object" || body === null || !("status" in body) || body.status !== "ok") {
          throw new Error("Unexpected health response");
        }
        if (active) setStatus("reachable");
      } catch {
        // Network, timeout, and response errors are surfaced in the status message.
        if (active) setStatus("unavailable");
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void checkHealth();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return <p role="status" className="text-sm text-neutral-400">{messages[status]}</p>;
}
