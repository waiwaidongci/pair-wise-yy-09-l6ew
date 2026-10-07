import { For, Show, createMemo } from "solid-js";
import { Tabs } from "@kobalte/core/tabs";
import type { DesignToken, TokenKind } from "../types/tokens";
import { TOKEN_LABELS } from "../utils/exporters";
import { contrastGrade, contrastRatio } from "../utils/color";
import { useTokenStore } from "../stores/tokenStore";
import { buildTokenIndex, displayValue, referenceOf } from "../utils/references";

const kinds: TokenKind[] = ["color", "fontSize", "spacing", "radius", "shadow", "motion"];

function TokenRow(props: { token: DesignToken; kind: TokenKind }) {
  const store = useTokenStore();
  const isColor = () => props.kind === "color";
  const index = createMemo(() => buildTokenIndex(store.activeTheme()));
  const ref = createMemo(() => referenceOf(props.token));
  const effective = createMemo(() => displayValue(props.token, index()));
  const ratio = createMemo(() => {
    if (!isColor()) return 0;
    const background = index().get("color-surface")?.value ?? "#fff";
    return contrastRatio(effective(), background);
  });

  return (
    <div class="grid grid-cols-[minmax(150px,1.2fr)_minmax(110px,0.8fr)_32px] gap-3 border-b border-slate-100 px-3 py-3 last:border-0">
      <div>
        <input
          class="w-full rounded-md border border-transparent bg-transparent px-2 py-1 font-mono text-xs font-semibold text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white"
          value={props.token.name}
          onInput={(event) => store.updateToken(props.kind, props.token.id, { name: event.currentTarget.value })}
        />
        <div class="mt-1 flex flex-wrap items-center gap-1 px-2">
          <Show when={ref()}>
            <span class="rounded-full bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-700" title="别名引用，基础值更新后自动重算">
              → {ref()}
            </span>
          </Show>
          <Show when={props.token.override !== undefined}>
            <span class="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">已覆盖</span>
          </Show>
          <Show when={props.token.needsReview}>
            <span class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">待复核</span>
          </Show>
          <Show when={props.token.conflict?.length}>
            <span class="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">冲突两边留</span>
          </Show>
          <span class="line-clamp-1 text-[11px] text-slate-400">{props.token.description}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Show when={isColor()}>
          <input
            type="color"
            class="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5"
            value={effective().match(/^#[0-9a-f]{6}$/i) ? effective() : "#000000"}
            onInput={(event) => store.updateToken(props.kind, props.token.id, { value: event.currentTarget.value })}
          />
        </Show>
        <input
          class="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-blue-400"
          value={effective()}
          onInput={(event) => store.updateToken(props.kind, props.token.id, { value: event.currentTarget.value })}
        />
      </div>
      <div class="flex flex-col items-center gap-1">
        <button
          class="rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
          title="删除令牌"
          onClick={() => store.removeToken(props.kind, props.token.id)}
        >
          ×
        </button>
        <Show when={props.token.override !== undefined}>
          <button
            class="rounded-md px-1 text-[10px] font-bold text-blue-600 hover:bg-blue-50"
            title="恢复引用：清除显式覆盖，按基础值重算"
            onClick={() => store.restoreReference(props.kind, props.token.id)}
          >
            恢复引用
          </button>
        </Show>
      </div>
      <Show when={isColor()}>
        <div class="col-span-2 col-start-2 flex items-center justify-between rounded-md bg-slate-50 px-2 py-1">
          <span class="text-[11px] text-slate-500">对比度 {ratio().toFixed(2)}:1</span>
          <span
            class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              ratio() >= 4.5 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {contrastGrade(ratio())}
          </span>
        </div>
      </Show>
      <Show when={props.token.conflict?.length}>
        <div class="col-span-3 rounded-md border border-purple-200 bg-purple-50 px-3 py-2">
          <p class="text-[10px] font-bold uppercase tracking-wider text-purple-700">两边修改了同一令牌，值都保留</p>
          <div class="mt-1 flex flex-wrap gap-2">
            <For each={props.token.conflict}>
              {(value) => (
                <button
                  class="rounded-md border border-purple-300 bg-white px-2 py-1 font-mono text-xs text-purple-800 hover:bg-purple-100"
                  title="采用此值"
                  onClick={() => store.resolveConflict(props.kind, props.token.id, value)}
                >
                  {value}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

export default function TokenEditor() {
  const store = useTokenStore();
  return (
    <section class="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 class="text-sm font-bold text-slate-800">令牌编辑器</h2>
          <p class="text-xs text-slate-400">别名随基础值自动重算，显式覆盖保留待复核</p>
        </div>
        <button
          class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          onClick={() => {
            const label = window.prompt("快照名称", `${store.activeTheme().name} ${new Date().toLocaleTimeString("zh-CN")}`);
            if (label !== null) store.saveSnapshot(label);
          }}
        >
          保存快照
        </button>
      </div>

      <Tabs defaultValue="color" class="flex min-h-0 flex-1 flex-col">
        <Tabs.List class="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50/70 px-3 py-2">
          <For each={kinds}>
            {(kind) => (
              <Tabs.Trigger
                value={kind}
                class="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-500 outline-none transition data-[selected]:bg-white data-[selected]:text-blue-700 data-[selected]:shadow-sm"
              >
                {TOKEN_LABELS[kind]}
              </Tabs.Trigger>
            )}
          </For>
        </Tabs.List>
        <For each={kinds}>
          {(kind) => (
            <Tabs.Content value={kind} class="scroll-area min-h-0 flex-1 overflow-y-auto">
              <div class="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {store.activeTheme().tokens[kind].length} 个令牌
                </span>
                <button class="text-xs font-semibold text-blue-600 hover:text-blue-800" onClick={() => store.addToken(kind)}>
                  + 添加令牌
                </button>
              </div>
              <For each={store.activeTheme().tokens[kind]}>
                {(token) => <TokenRow token={token} kind={kind} />}
              </For>
            </Tabs.Content>
          )}
        </For>
      </Tabs>
    </section>
  );
}
