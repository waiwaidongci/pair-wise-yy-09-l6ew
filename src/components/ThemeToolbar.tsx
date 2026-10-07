import { For, Show, createSignal } from "solid-js";
import { Select } from "@kobalte/core/select";
import { useTokenStore } from "../stores/tokenStore";
import { downloadText, toCssVariables, toSassVariables, toStyleDictionaryJson } from "../utils/exporters";
import { checkExportGate, type ExportGate } from "../utils/refs";
import type { Theme } from "../types/tokens";
import RevisionCenter from "./RevisionCenter";

export default function ThemeToolbar() {
  const store = useTokenStore();
  const [format, setFormat] = createSignal("json");
  const [importOpen, setImportOpen] = createSignal(false);
  const [importText, setImportText] = createSignal("");
  const [importError, setImportError] = createSignal("");
  const [revisionOpen, setRevisionOpen] = createSignal(false);
  const [blockedGate, setBlockedGate] = createSignal<ExportGate | null>(null);

  const pendingCount = () =>
    store.revisions().filter((revision) => revision.status === "pending").length + store.conflicts().length;

  const exportCurrent = () => {
    const theme = store.activeTheme();
    const gate = checkExportGate(theme, store.activeRevision());
    // 引用成环、目标缺失或包过期：保留本批编辑，停在导出前
    if (gate.blocked) {
      setBlockedGate(gate);
      return;
    }
    if (format() === "css") {
      downloadText(`${theme.id}.css`, toCssVariables(theme), "text/css");
    } else if (format() === "scss") {
      downloadText(`${theme.id}.scss`, toSassVariables(theme), "text/x-scss");
    } else {
      downloadText(`${theme.id}.tokens.json`, toStyleDictionaryJson(theme), "application/json");
    }
  };

  const importPackage = () => {
    try {
      store.importPackage(importText());
      setImportOpen(false);
      setImportText("");
      setImportError("");
      setRevisionOpen(true);
    } catch {
      setImportError("无法解析令牌包，请确认是工作台主题、Style Dictionary 或扁平键值 JSON。");
    }
  };

  const uploadJson = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  return (
    <div class="flex flex-wrap items-center gap-2">
      <div class="min-w-[180px]">
        <Select<Theme>
          options={store.themes()}
          value={store.activeTheme()}
          optionValue="id"
          optionTextValue="name"
          onChange={(theme) => theme && store.setActiveThemeId(theme.id)}
          itemComponent={(props) => (
            <Select.Item item={props.item} class="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-blue-50 data-[selected]:font-bold data-[selected]:text-blue-700">
              <Select.ItemLabel>{props.item.rawValue.name}</Select.ItemLabel>
            </Select.Item>
          )}
        >
          <Select.Trigger class="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm outline-none">
            <Select.Value<Theme> class="truncate">{(state) => state.selectedOption().name}</Select.Value>
            <Select.Icon class="ml-2 text-slate-400">⌄</Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content class="z-50 min-w-[180px] rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
              <Select.Listbox />
            </Select.Content>
          </Select.Portal>
        </Select>
      </div>
      <button class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => {
        const name = window.prompt("新主题名称", `品牌主题 ${store.themes().length + 1}`);
        if (name) store.createTheme(name);
      }}>
        复制主题
      </button>
      <div class="flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <select class="border-r border-slate-200 bg-white px-2 py-2 text-xs font-semibold outline-none" value={format()} onChange={(event) => setFormat(event.currentTarget.value)}>
          <option value="json">Style Dictionary JSON</option>
          <option value="css">CSS Variables</option>
          <option value="scss">Sass Variables</option>
        </select>
        <button class="px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50" onClick={exportCurrent}>导出</button>
      </div>
      <button class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setImportOpen(true)}>
        导入 JSON
      </button>
      <button
        class="relative rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        onClick={() => setRevisionOpen(true)}
      >
        修订中心
        <Show when={pendingCount() > 0}>
          <span class="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-black text-white">
            {pendingCount()}
          </span>
        </Show>
      </button>

      <RevisionCenter open={revisionOpen()} onClose={() => setRevisionOpen(false)} />

      <Show when={blockedGate()}>
        {(gate) => (
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setBlockedGate(null)}>
            <div class="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <h3 class="font-bold text-slate-900">导出已暂停</h3>
              <p class="mt-1 text-xs text-slate-500">本批编辑已保留，解决以下问题后即可导出：</p>
              <ul class="mt-3 flex flex-col gap-1.5 text-xs">
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
                    令牌包已过期（有效期至 {gate().expiresAt}），请导入新版本后再导出。
                  </li>
                </Show>
              </ul>
              <Show when={gate().pendingReviewCount > 0}>
                <p class="mt-2 text-xs text-amber-600">另有 {gate().pendingReviewCount} 个显式覆盖待复核（不阻止导出）。</p>
              </Show>
              <div class="mt-4 flex justify-end gap-2">
                <button class="rounded-lg border px-4 py-2 text-sm" onClick={() => setBlockedGate(null)}>知道了</button>
                <button
                  class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white"
                  onClick={() => {
                    setBlockedGate(null);
                    setRevisionOpen(true);
                  }}
                >
                  打开修订中心
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      {importOpen() && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setImportOpen(false)}>
          <div class="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-bold text-slate-900">导入令牌包</h3>
                <p class="mt-1 text-xs text-slate-500">
                  支持工作台主题、Style Dictionary 与扁平键值 JSON；同一令牌包重复导入会续作到待应用修订
                </p>
              </div>
              <input type="file" accept=".json,application/json" class="text-xs" onChange={(event) => uploadJson(event.currentTarget.files?.[0])} />
            </div>
            <textarea
              class="mt-4 h-72 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs outline-none focus:border-blue-400"
              placeholder='{"name":"品牌令牌包","version":"2.1.0","expiresAt":"2026-12-31","color":{"brand":{"primary":{"value":"#356ae6","type":"color"}}}}'
              value={importText()}
              onInput={(event) => setImportText(event.currentTarget.value)}
            />
            <Show when={importError()}>
              <p class="mt-2 text-xs text-rose-600">{importError()}</p>
            </Show>
            <div class="mt-4 flex justify-end gap-2">
              <button class="rounded-lg border px-4 py-2 text-sm" onClick={() => setImportOpen(false)}>取消</button>
              <button class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40" disabled={!importText().trim()} onClick={importPackage}>解析为修订</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
