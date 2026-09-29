import type { ReactNode } from "react";

export function TerminalPanel({ title, meta, children, className = "" }: {
  title: string; meta?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={`terminal-panel ${className}`}>
    <header className="panel-heading"><h2>{title}</h2>{meta}</header>
    {children}
  </section>;
}
export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "blue" | "green" | "amber" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
