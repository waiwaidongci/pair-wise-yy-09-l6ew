import { For, Show } from "solid-js";
import { useTokenStore } from "../stores/tokenStore";
import { checkExportGate, isRevisionExpired } from "../utils/refs";
import { DELETED_MARK } from "../utils/merge";
import { TOKEN_LABELS } from "../utils/exporters";

const formatTime = (iso: string): string => {
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? iso : time.toLocaleString("zh-CN", { hour12: false });
};

export default function RevisionCenter(props: { open: boolean; onClose: () => void }) {
  const store = useTokenStore();
  const gate = () => checkExportGate(store.activeTheme(), store.activeRevision());
  const themeName = (id: string) => store.themes().find((theme) => theme.id === id)?.name ?? "未知主题";

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={props.onClose}>
        <div
          class="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 class="font-bold text-slate-900">修订中心</h3>
              <p class="mt-0.5 text-xs text-slate-500">导入包 · 主题草稿 · 发布快照串成可续作的修订</p>
            </div>
            <button class="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100" onClick={props.onClose}>×</button>
          </div>

          <div class="scroll-area min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <section>
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">导入修订</h4>
              <Show
                when={store.revisions().length}
                fallback={<p class="mt-2 text-xs text-slate-400">暂无导入记录，通过「导入 JSON」解析外部令牌包。</p>}
              >
                <div class="mt-2 flex flex-col gap-2">
                  <For each={store.revisions()}>
                    {(revision) => (
                      <div class="rounded-lg border border-slate-200 p-3">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="text-sm font-bold text-slate-800">{revision.packageName}</span>
                          <span class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                            {revision.version}
                          </span>
                          <span
                            class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              revision.status === "pending"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {revision.status === "pending" ? "待应用" : "已应用"}
                          </span>
                          <Show when={isRevisionExpired(revision)}>
                            <span class="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                              包已过期
                            </span>
                          </Show>
                        </div>
                        <p class="mt-1 text-[11px] text-slate-400">
                          导入于 {formatTime(revision.importedAt)} · 有效期至{" "}
                          {revision.expiresAt ? formatTime(revision.expiresAt) : "长期"} · 历史版本{" "}
                          {revision.history.length} 个
                        </p>
                        <div class="mt-2 flex flex-wrap gap-2">
                          <button
                            class="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-500"
                            onClick={() => store.applyRevision(revision.id)}
                          >
                            应用到当前主题
                          </button>
                          <button
                            class="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                            onClick={() => store.createThemeFromRevision(revision.id)}
                          >
                            基于包新建主题
                          </button>
                          <button
                            class="rounded-md px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600"
                            onClick={() => store.removeRevision(revision.id)}
                          >
                            移除
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section class="mt-5">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">合并冲突</h4>
              <Show
                when={store.conflicts().length}
                fallback={<p class="mt-2 text-xs text-slate-400">暂无冲突。多标签页同时改同一令牌时，两侧值都会保留在这里。</p>}
              >
                <div class="mt-2 flex flex-col gap-2">
                  <For each={store.conflicts()}>
                    {(conflict) => (
                      <div class="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="font-mono text-xs font-bold text-slate-800">{conflict.name}</span>
                          <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                            {themeName(conflict.themeId)} · {TOKEN_LABELS[conflict.kind]}
                          </span>
                          <span class="text-[10px] text-slate-400">{conflict.detectedAt}</span>
                        </div>
                        <div class="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div class="rounded-md bg-white px-2 py-1.5">
                            <p class="text-[10px] font-bold text-slate-400">当前值</p>
                            <code class="text-slate-800">{conflict.currentValue}</code>
                          </div>
                          <div class="rounded-md bg-white px-2 py-1.5">
                            <p class="text-[10px] font-bold text-slate-400">另一侧</p>
                            <code class={conflict.incomingValue === DELETED_MARK ? "text-rose-600" : "text-slate-800"}>
                              {conflict.incomingValue}
                            </code>
                          </div>
                        </div>
                        <div class="mt-2 flex gap-2">
                          <button
                            class="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                            onClick={() => store.resolveConflict(conflict.id, "current")}
                          >
                            保留当前值
                          </button>
                          <button
                            class="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-700"
                            onClick={() => store.resolveConflict(conflict.id, "incoming")}
                          >
                            {conflict.incomingValue === DELETED_MARK ? "接受删除" : "采用另一侧值"}
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section class="mt-5">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">当前主题导出校验</h4>
              <Show
                when={gate().blocked || gate().pendingReviewCount > 0}
                fallback={<p class="mt-2 text-xs text-emerald-600">✓ 引用完整，可以导出。</p>}
              >
                <ul class="mt-2 flex flex-col gap-1.5 text-xs">
                  <For each={gate().issues}>
                    {(issue) => (
                      <li class="rounded-md bg-rose-50 px-2.5 py-1.5 text-rose-700">
                        {issue.type === "cycle" ? "引用成环" : "目标缺失"}：
                        <span class="font-mono font-semibold">{issue.token}</span>
                        <span class="ml-1 text-rose-500">{issue.detail}</span>
                      </li>
                    )}
                  </For>
                  <Show when={gate().expired}>
                    <li class="rounded-md bg-rose-50 px-2.5 py-1.5 text-rose-700">
                      令牌包已过期（有效期至 {gate().expiresAt ? formatTime(gate().expiresAt!) : "未知"}
                      ），请导入新版本后再导出。
                    </li>
                  </Show>
                  <Show when={gate().pendingReviewCount > 0}>
                    <li class="rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-700">
                      {gate().pendingReviewCount} 个显式覆盖待复核（不阻止导出，可在编辑器中确认或恢复引用）。
                    </li>
                  </Show>
                </ul>
              </Show>
            </section>
          </div>
        </div>
      </div>
    </Show>
  );
}
