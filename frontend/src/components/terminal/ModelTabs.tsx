import { useCurrency } from "@/lib/currency-context";
import { MODEL_TABS, type ModelTab } from "@/types/model";
import type { KeyboardEvent } from "react";

export function ModelTabs({ active, setActive }: { active: ModelTab; setActive: (tab: ModelTab) => void }) {
  const { currencyLabel } = useCurrency();
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const destination = event.key === "ArrowRight" ? (index + 1) % MODEL_TABS.length
      : event.key === "ArrowLeft" ? (index + MODEL_TABS.length - 1) % MODEL_TABS.length
      : event.key === "Home" ? 0 : event.key === "End" ? MODEL_TABS.length - 1 : null;
    if (destination === null) return;
    event.preventDefault(); setActive(MODEL_TABS[destination][0]);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]");
    buttons?.[destination].focus();
  }
  return <div className="model-navigation"><div role="tablist" aria-label="Financial model views" className="model-tabs">
    {MODEL_TABS.map(([key, label], index) => <button key={key} id={`tab-${key}`} role="tab" aria-selected={active === key}
      aria-controls="model-view" tabIndex={active === key ? 0 : -1}
      onKeyDown={event => navigate(event, index)} onClick={() => setActive(key)}>{label}</button>)}
  </div><span className="table-unit">{currencyLabel}</span></div>;
}
