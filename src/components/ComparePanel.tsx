import { For, Show, createMemo, createSignal } from "solid-js";
import { diffThemes, downloadText, snapshotToCssVariables, snapshotToStyleDictionary } from "../utils/exporters";
import { useTokenStore } from "../stores/tokenStore";

export default function ComparePanel() {
  const store = useTokenStore();
  const [beforeId, setBeforeId] = createSignal(store.snapshots()[0]?.id ?? "");
  const [afterId, setAfterId] = createSignal("current");
  const before = createMemo(() => store.snapshots().find((item) => item.id === beforeId())?.theme);
  const after = createMemo(() => afterId() === "current" ? store.activeTheme() : store.snapshots().find((item) => item.id === afterId())?.theme);
  const differences = createMemo(() => before() && after() ? diffThemes(before()!, after()!) : []);

  return (
    <div class="flex h-full min-h-0 flex-col gap-4">
      <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex flex-wrap items-end gap-4">
          <div>
            <p class="text-xs font-bold uppercase tracking-wider text-slate-400">基准快照</p>
            <select class="mt-2 min-w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={beforeId()} onChange={(event) => setBeforeId(event.currentTarget.value)}>
              <option value="">请选择快照</option>
              <For each={store.snapshots()}>{(snapshot) => <option value={snapshot.id}>{snapshot.label} · {snapshot.createdAt}</option>}</For>
            </select>
          </div>
          <div class="pb-3 text-xl text-slate-300">→</div>
          <div>
            <p class="text-xs font-bold uppercase tracking-wider text-slate-400">对比目标</p>
            <select class="mt-2 min-w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={afterId()} onChange={(event) => setAfterId(event.currentTarget.value)}>
              <option value="current">当前编辑主题 · {store.activeTheme().name}</option>
              <For each={store.snapshots()}>{(snapshot) => <option value={snapshot.id}>{snapshot.label} · {snapshot.createdAt}</option>}</For>
            </select>
          </div>
          <div class="ml-auto rounded-lg bg-slate-50 px-4 py-3">
            <p class="text-xs text-slate-500">检测到变化</p>
            <p class="text-2xl font-black text-slate-900">{differences().length}</p>
          </div>
        </div>
      </section>

      <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold text-slate-800">发布快照</h2>
          <p class="text-xs text-slate-400">历史发布始终按原快照冻结值导出</p>
        </div>
        <Show
          when={store.snapshots().length}
          fallback={<p class="mt-3 text-xs text-slate-400">暂无快照，在编辑器中保存后可在此导出。</p>}
        >
          <div class="mt-3 flex gap-3 overflow-x-auto pb-1">
            <For each={store.snapshots()}>
              {(snapshot) => (
                <div class="min-w-52 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                  <div class="flex items-center gap-2">
                    <p class="truncate text-xs font-bold text-slate-800">{snapshot.label}</p>
                    <Show when={snapshot.revisionStatus === "pending"}>
                      <span class="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                        待确认
                      </span>
                    </Show>
                  </div>
                  <p class="mt-1 text-[11px] text-slate-400">{snapshot.createdAt}</p>
                  <div class="mt-2 flex gap-2">
                    <button
                      class="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                      onClick={() =>
                        downloadText(`${snapshot.id}.tokens.json`, snapshotToStyleDictionary(snapshot), "application/json")
                      }
                    >
                      导出 JSON
                    </button>
                    <button
                      class="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                      onClick={() => downloadText(`${snapshot.id}.css`, snapshotToCssVariables(snapshot), "text/css")}
                    >
                      导出 CSS
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>

      <section class="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 class="text-sm font-bold">令牌差异</h2>
          <p class="text-xs text-slate-400">仅展示新增、删除和值变化</p>
        </div>
        <Show
          when={differences().length}
          fallback={<div class="flex flex-1 items-center justify-center text-sm text-slate-400">选择两个不同快照后查看差异，或先保存多个快照。</div>}
        >
          <div class="scroll-area min-h-0 flex-1 overflow-auto">
            <div class="grid grid-cols-[1.2fr_1fr_1fr_88px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span>令牌</span><span>修改前</span><span>修改后</span><span>类型</span>
            </div>
            <For each={differences()}>
              {(difference) => (
                <div class="grid grid-cols-[1.2fr_1fr_1fr_88px] items-center border-b border-slate-100 px-4 py-3 text-xs">
                  <span class="font-mono font-semibold text-slate-800">{difference.path}</span>
                  <div class="flex items-center gap-2">
                    <Show when={difference.before.startsWith("#")}><span class="h-4 w-4 rounded" style={{ background: difference.before }} /></Show>
                    <code class="truncate text-rose-600">{difference.before}</code>
                  </div>
                  <div class="flex items-center gap-2">
                    <Show when={difference.after.startsWith("#")}><span class="h-4 w-4 rounded" style={{ background: difference.after }} /></Show>
                    <code class="truncate text-emerald-700">{difference.after}</code>
                  </div>
                  <span class="w-fit rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-600">
                    {difference.kind === "changed" ? "值变化" : difference.kind === "added" ? "新增" : "移除"}
                  </span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>
    </div>
  );
}
