import type { SensitivityResponse } from "@/types/sensitivity";
import { sensitivityTone } from "@/lib/sensitivity";
import { formatMultiple, formatPercent } from "@/lib/format";
import { Badge, TerminalPanel } from "@/components/ui/TerminalPanel";

export function SensitivityMatrix({ metric, data }: { metric: "irr" | "moic"; data: SensitivityResponse }) {
  return <TerminalPanel title={metric === "irr" ? "IRR SENSITIVITY" : "MOIC SENSITIVITY"} meta={<Badge tone="blue">ENGINE RESULTS</Badge>}>
    <div className="table-scroll"><table className="sensitivity-table">
      <caption>ROWS: ENTRY MULTIPLE · COLUMNS: EXIT MULTIPLE</caption>
      <thead><tr><th scope="col">ENTRY / EXIT</th>{data.exit_multiples.map((value, i) => <th scope="col" key={i}>{formatMultiple(value)}</th>)}</tr></thead>
      <tbody>{data.matrix.map((row, r) => <tr key={r}><th scope="row">{formatMultiple(data.entry_multiples[r])}</th>
        {row.map((cell, c) => {
          const base = r === data.base_case.row_index && c === data.base_case.column_index;
          return <td key={c} data-entry={cell.entry_multiple} data-exit={cell.exit_multiple}
            className={`${sensitivityTone(cell.irr)} ${base ? "matrix-reference" : ""}`}>
            {base && <small>BASE CASE</small>}{metric === "irr" ? cell.irr === null ? "N/A" : formatPercent(cell.irr) : formatMultiple(cell.moic)}
          </td>;
        })}</tr>)}</tbody>
    </table></div><div className="matrix-footnote">FULL FIVE-YEAR MODEL PER CELL · COLORS BASED ON IRR</div>
  </TerminalPanel>;
}
