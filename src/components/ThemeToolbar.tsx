import { Show, createMemo, createSignal } from "solid-js";
import { Select } from "@kobalte/core/select";
import { useTokenStore } from "../stores/tokenStore";
import { downloadText, toCssVariables, toSassVariables, toStyleDictionaryJson } from "../utils/exporters";
import { parsePackage } from "../utils/packages";
import type { Theme } from "../types/tokens";
import IssueList from "./IssueList";

export default function ThemeToolbar() {
  const store = useTokenStore();
  const [format, setFormat] = createSignal("json");
  const [importOpen, setImportOpen] = createSignal(false);
  const [importText, setImportText] = createSignal("");
  const [importMode, setImportMode] = createSignal<"new" | "sync">("new");
  const [importError, setImportError] = createSignal("");
  const [blockingIssues, setBlockingIssues] = createSignal<ReturnType<typeof store.issues>>([]);

  const parsedPackage = createMemo(() => {
    const text = importText().trim();
    if (!text) return null;
    return parsePackage(text);
  });

  const latestPackage = createMemo(() => {
    const theme = store.activeTheme();
    if (!theme.packageId) return null;
    return store.packages().find((pkg) => pkg.id === theme.packageId) ?? null;
  });

  const isStale = createMemo(() => {
    const pkg = latestPackage();
    const theme = store.activeTheme();
    return !!pkg && (theme.packageVersion ?? 0) < pkg.version;
  });

  const exportCurrent = () => {
    const issues = store.issues();
    if (issues.length) {
      setBlockingIssues(issues);
      return;
    }
    const theme = store.activeTheme();
    if (format() === "css") {
      downloadText(`${theme.id}.css`, toCssVariables(theme), "text/css");
    } else if (format() === "scss") {
      downloadText(`${theme.id}.scss`, toSassVariables(theme), "text/x-scss");
    } else {
      downloadText(`${theme.id}.tokens.json`, toStyleDictionaryJson(theme), "application/json");
    }
  };

  const doImport = () => {
    const result = store.importPackage(importText(), importMode());
    if (!result.ok) {
      setImportError(result.error ?? "导入失败");
      return;
    }
    setImportOpen(false);
    setImportText("");
    setImportError("");
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

      <Show when={latestPackage()}>
        <button
          class={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold ${
            isStale()
              ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
          title={isStale() ? "令牌包有新版本，导入后可续作到当前草稿" : "当前草稿已同步到最新包"}
          onClick={() => {
            setImportMode("sync");
            setImportOpen(true);
          }}
        >
          <span class="font-mono">{latestPackage()!.name} v{latestPackage()!.version}</span>
          <Show when={isStale()}>
            <span class="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">已过期</span>
          </Show>
        </button>
      </Show>

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
        <button
          class="px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
          classList={{ "text-rose-600": store.issues().length > 0 }}
          onClick={exportCurrent}
        >
          导出{store.issues().length ? `（${store.issues().length} 项待处理）` : ""}
        </button>
      </div>
      <button class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => {
        setImportMode("new");
        setImportError("");
        setImportOpen(true);
      }}>
        导入 JSON
      </button>

      <Show when={importOpen()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setImportOpen(false)}>
          <div class="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-bold text-slate-900">导入令牌包</h3>
                <p class="mt-1 text-xs text-slate-500">支持 {`{package, tokens}`} 包格式与扁平键值 JSON</p>
              </div>
              <input type="file" accept=".json,application/json" class="text-xs" onChange={(event) => uploadJson(event.currentTarget.files?.[0])} />
            </div>
            <textarea
              class="mt-4 h-60 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs outline-none focus:border-blue-400"
              placeholder='{"package":{"name":"基础令牌包","version":2},"tokens":{"color":{"brand":{"primary":{"value":"#356ae6"}}}}}'
              value={importText()}
              onInput={(event) => {
                setImportText(event.currentTarget.value);
                setImportError("");
              }}
            />
            <Show when={parsedPackage()}>
              <div class="mt-3 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                <span class="font-bold">{parsedPackage()!.name}</span>
                <span class="rounded-full bg-blue-200 px-1.5 py-0.5 text-[10px] font-bold">v{parsedPackage()!.version}</span>
                <span class="text-blue-600">{Object.keys(parsedPackage()!.tokens).length} 个令牌</span>
              </div>
            </Show>
            <Show when={importError()}>
              <p class="mt-2 text-xs font-semibold text-rose-600">{importError()}</p>
            </Show>
            <div class="mt-4 flex items-center justify-between gap-2">
              <label class="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={importMode() === "sync"}
                  disabled={!store.activeTheme().packageId}
                  onChange={(event) => setImportMode(event.currentTarget.checked ? "sync" : "new")}
                />
                续作到当前草稿
                <Show when={!store.activeTheme().packageId}>
                  <span class="text-slate-400">（当前草稿无包来源，将按现值升级）</span>
                </Show>
              </label>
              <div class="flex gap-2">
                <button class="rounded-lg border px-4 py-2 text-sm" onClick={() => setImportOpen(false)}>取消</button>
                <button
                  class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                  disabled={!parsedPackage()}
                  onClick={doImport}
                >
                  {importMode() === "sync" ? "续作修订" : "导入为新主题"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>

      <Show when={blockingIssues().length}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setBlockingIssues([])}>
          <div class="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h3 class="font-bold text-slate-900">无法导出：本批编辑已保留</h3>
            <p class="mt-1 text-xs text-slate-500">处理以下问题后才能导出，草稿内容不会丢失。</p>
            <div class="mt-4">
              <IssueList issues={blockingIssues()} />
            </div>
            <div class="mt-4 flex justify-end">
              <button class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white" onClick={() => setBlockingIssues([])}>
                知道了
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
