import { For } from "solid-js";
import type { ExportIssue } from "../types/tokens";
import { describeIssue } from "../utils/packages";

const TYPE_LABELS: Record<ExportIssue["type"], string> = {
  cycle: "引用成环",
  missing: "目标缺失",
  stale: "包已过期",
  conflict: "合并冲突",
};

const TYPE_STYLES: Record<ExportIssue["type"], string> = {
  cycle: "bg-rose-100 text-rose-700",
  missing: "bg-rose-100 text-rose-700",
  stale: "bg-amber-100 text-amber-700",
  conflict: "bg-purple-100 text-purple-700",
};

export default function IssueList(props: { issues: ExportIssue[] }) {
  return (
    <ul class="space-y-2">
      <For each={props.issues}>
        {(issue) => (
          <li class="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <span class={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TYPE_STYLES[issue.type]}`}>
              {TYPE_LABELS[issue.type]}
            </span>
            <span class="font-mono text-slate-700">{describeIssue(issue)}</span>
          </li>
        )}
      </For>
    </ul>
  );
}
