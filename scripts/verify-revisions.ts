/**
 * 核心逻辑验证：别名解析/重算、修订应用、跨标签合并、导出门禁、包解析。
 * 运行：corepack pnpm dlx tsx scripts/verify-revisions.ts
 */
import { resolveTheme, recomputeAliases, checkExportGate, resolvedValues } from "../src/utils/refs";
import { mergePersistedState, DELETED_MARK } from "../src/utils/merge";
import { parseImportedPackage, applyRevisionToTheme } from "../src/utils/importers";
import type { ImportRevision, PersistedState, Theme } from "../src/types/tokens";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name}`, extra ?? "");
  }
}

const baseTheme = (): Theme => ({
  id: "theme-t",
  name: "测试",
  baseRevisionId: null,
  tokens: {
    color: [
      { id: "c1", name: "color.brand", value: "#111111", description: "" },
      { id: "c2", name: "color.accent", value: "{color.brand}", ref: "color.brand", description: "" },
      {
        id: "c3",
        name: "color.custom",
        value: "#ff0000",
        description: "",
        ref: "color.brand",
        overridden: true,
        overrideBaseValue: "#111111",
      },
    ],
    fontSize: [],
    spacing: [],
    radius: [],
    shadow: [],
    motion: [],
  },
});

console.log("— 别名解析与重算 —");
{
  const theme = baseTheme();
  const { values, issues } = resolveTheme(theme);
  check("别名解析到基础值", values["color.accent"] === "#111111");
  check("覆盖令牌用覆盖值", values["color.custom"] === "#ff0000");
  check("无问题", issues.length === 0);

  // 基础值更新 → 未覆盖别名重算，覆盖保留并标待复核
  theme.tokens.color[0].value = "#222222";
  const { theme: next } = recomputeAliases(theme);
  check("别名失效重算", next.tokens.color[1].value === "#222222");
  check("显式覆盖保留", next.tokens.color[2].value === "#ff0000");
  check("覆盖标待复核", next.tokens.color[2].pendingReview === true);
}

console.log("— 引用成环 / 目标缺失 —");
{
  const theme = baseTheme();
  theme.tokens.color[0] = { ...theme.tokens.color[0], ref: "color.accent", value: "{color.accent}" };
  const { issues } = resolveTheme(theme);
  check("检测到环", issues.some((i) => i.type === "cycle"), issues);

  const theme2 = baseTheme();
  theme2.tokens.color[1] = { ...theme2.tokens.color[1], ref: "color.gone" };
  const gate = checkExportGate(theme2, null);
  check("缺失目标阻塞导出", gate.blocked && gate.issues.some((i) => i.type === "missing"));
  check("缺失目标回退缓存值", resolvedValues(theme2)["color.accent"] === "{color.brand}");
}

console.log("— 包过期门禁 —");
{
  const revision: ImportRevision = {
    id: "r1",
    packageName: "包",
    version: "1",
    importedAt: new Date().toISOString(),
    expiresAt: "2020-01-01",
    status: "applied",
    tokens: baseTheme().tokens,
    history: [],
  };
  check("过期包阻塞导出", checkExportGate(baseTheme(), revision).blocked);
  revision.expiresAt = "2999-01-01";
  check("未过期可导出", !checkExportGate(baseTheme(), revision).blocked);
}

console.log("— 包解析（三种格式 + 别名） —");
{
  const sd = parseImportedPackage(
    JSON.stringify({
      name: "品牌包",
      version: "2.0.0",
      expiresAt: "2999-01-01",
      color: { brand: { primary: { value: "#356ae6", type: "color" } }, accent: { value: "{color.brand.primary}" } },
      space: { 4: { value: "16px", type: "dimension" } },
    }),
  );
  check("SD 嵌套解析", sd.tokens.color.length === 2 && sd.tokens.spacing.length === 1, sd.tokens);
  check("SD 类别推断", sd.tokens.color[0].name === "color.brand.primary");
  check("SD 别名识别", sd.tokens.color[1].ref === "color.brand.primary");

  const flat = parseImportedPackage(JSON.stringify({ "color.brand.primary": "#123456", "motion.duration.base": "200ms" }));
  check("扁平键值解析", flat.tokens.color.length === 1 && flat.tokens.motion.length === 1);

  const wb = parseImportedPackage(
    JSON.stringify({
      name: "工作台包",
      tokens: { color: [{ id: "x", name: "color.brand", value: "#000000", description: "d" }], fontSize: [] },
    }),
  );
  check("工作台格式解析", wb.tokens.color.length === 1 && wb.packageName === "工作台包");
}

console.log("— 修订应用（覆盖保留 + 别名重算） —");
{
  const theme = baseTheme();
  const revision: ImportRevision = {
    id: "r2",
    packageName: "包",
    version: "3",
    importedAt: new Date().toISOString(),
    expiresAt: null,
    status: "pending",
    tokens: {
      ...baseTheme().tokens,
      color: [
        { id: "p1", name: "color.brand", value: "#999999", description: "", ref: null },
        { id: "p2", name: "color.accent", value: "{color.brand}", description: "", ref: "color.brand" },
        { id: "p3", name: "color.new", value: "#00ff00", description: "", ref: null },
      ],
    },
  };
  const applied = recomputeAliases(applyRevisionToTheme(theme, revision)).theme;
  check("基础值被包更新", applied.tokens.color.find((t) => t.name === "color.brand")?.value === "#999999");
  check("未覆盖别名重算", applied.tokens.color.find((t) => t.name === "color.accent")?.value === "#999999");
  const custom = applied.tokens.color.find((t) => t.name === "color.custom");
  check("覆盖值保留", custom?.value === "#ff0000");
  check("覆盖标待复核", custom?.pendingReview === true);
  check("新令牌并入", applied.tokens.color.some((t) => t.name === "color.new"));
  check("草稿挂接修订", applied.baseRevisionId === "r2");
}

console.log("— 跨标签页按令牌合并 —");
{
  const state = (themes: Theme[]): PersistedState => ({
    version: 2,
    themes,
    activeThemeId: "theme-t",
    snapshots: [],
    revisions: [],
    conflicts: [],
  });
  const base = baseTheme();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.tokens.color[0].value = "#aaaaaa"; // 本侧改 color.brand
  remote.tokens.color[1] = { ...remote.tokens.color[1], value: "#bbbbbb", ref: null }; // 对侧改 color.accent

  const merged = mergePersistedState(state([base]), state([local]), state([remote]));
  const mt = merged.themes[0];
  check("两侧不同令牌各自保留", mt.tokens.color[0].value === "#aaaaaa" && mt.tokens.color[1].value === "#bbbbbb");
  check("无冲突", merged.conflicts.length === 0);

  // 同一令牌两侧都改 → 冲突两边都留
  const local2 = structuredClone(base);
  const remote2 = structuredClone(base);
  local2.tokens.color[0].value = "#333333";
  remote2.tokens.color[0].value = "#222222";
  const merged2 = mergePersistedState(state([base]), state([local2]), state([remote2]));
  const conflict = merged2.conflicts[0];
  check("同令牌冲突记录", !!conflict && conflict.tokenId === "c1");
  check(
    "冲突两边都留",
    conflict !== undefined &&
      [conflict.currentValue, conflict.incomingValue].sort().join() === "#222222,#333333",
    conflict,
  );
  const kept = merged2.themes[0].tokens.color[0].value;
  check("令牌上保留确定性一侧", kept === "#222222" || kept === "#333333");

  // 收敛性：交换 local/remote 结果一致
  const merged3 = mergePersistedState(state([base]), state([remote2]), state([local2]));
  check(
    "合并收敛（两端同结果）",
    JSON.stringify(merged3.themes) === JSON.stringify(merged2.themes),
  );

  // 一侧删除 vs 一侧修改
  const local4 = structuredClone(base);
  local4.tokens.color = local4.tokens.color.filter((t) => t.id !== "c2");
  const remote4 = structuredClone(base);
  remote4.tokens.color[1].value = "#cccccc";
  const merged4 = mergePersistedState(state([base]), state([local4]), state([remote4]));
  check("删除 vs 修改保留修改", merged4.themes[0].tokens.color.some((t) => t.id === "c2" && t.value === "#cccccc"));
  check("删除冲突标记", merged4.conflicts[0]?.incomingValue === DELETED_MARK);
}

console.log("— 旧草稿按现值升级 —");
{
  // 模拟 v1 持久化数据（无 version、无引用元数据，值里带 {...} 字面量）
  const legacyTheme = {
    id: "theme-old",
    name: "旧草稿",
    tokens: {
      color: [
        { id: "c1", name: "color.brand", value: "#0a0a0a", description: "" },
        { id: "c2", name: "color.accent", value: "{color.brand}", description: "" },
      ],
      fontSize: [],
      spacing: [],
      radius: [],
      shadow: [],
      motion: [],
    },
  };
  // 直接走 store 的迁移逻辑不可行（依赖 localStorage），这里验证等价行为：
  const { values } = resolveTheme(legacyTheme as Theme);
  check("旧草稿 {ref} 按现值解析", values["color.accent"] === "#0a0a0a");
}

console.log("— 双标签页写入往返收敛 —");
{
  const state = (themes: Theme[]): PersistedState => ({
    version: 2,
    themes,
    activeThemeId: "theme-t",
    snapshots: [],
    revisions: [],
    conflicts: [],
  });
  // 模拟两个标签页：各自持有本地状态与 lastSynced，互相投递写入直到静默
  const tabA = { state: state([baseTheme()]), synced: "" };
  const tabB = { state: structuredClone(tabA.state), synced: "" };
  tabA.synced = JSON.stringify(tabA.state);
  tabB.synced = JSON.stringify(tabB.state);

  const deliver = (from: typeof tabA, to: typeof tabA, payload: PersistedState): PersistedState | null => {
    const base = to.synced ? (JSON.parse(to.synced) as PersistedState) : null;
    const merged = mergePersistedState(base, to.state, payload);
    to.synced = JSON.stringify(merged);
    to.state = merged;
    return JSON.stringify(merged) !== JSON.stringify(payload) ? merged : null;
  };

  // 两侧同时各改一个令牌 + 同改一个令牌（制造冲突）
  const editA = structuredClone(tabA.state);
  editA.themes[0].tokens.color[0].value = "#aaaaaa";
  const editB = structuredClone(tabB.state);
  editB.themes[0].tokens.color[0].value = "#bbbbbb";
  editB.themes[0].tokens.color[1] = { ...editB.themes[0].tokens.color[1], value: "#cccccc", ref: null };
  tabA.state = editA;
  tabB.state = editB;

  let writeA: PersistedState | null = tabA.state;
  let writeB: PersistedState | null = tabB.state;
  let rounds = 0;
  while ((writeA || writeB) && rounds < 10) {
    rounds += 1;
    const nextA = writeB ? deliver(tabB, tabA, writeB) : null;
    const nextB = writeA ? deliver(tabA, tabB, writeA) : null;
    writeA = nextA;
    writeB = nextB;
  }
  check("有限轮次内收敛", rounds < 10, rounds);
  check(
    "两端最终状态一致",
    JSON.stringify(tabA.state.themes) === JSON.stringify(tabB.state.themes),
  );
  const finalColor = tabA.state.themes[0].tokens.color;
  check("对侧独立编辑保留", finalColor[1].value === "#cccccc");
  check("冲突两边都留", tabA.state.conflicts.length === 1 && tabB.state.conflicts.length === 1);
}

if (failures > 0) {
  console.error(`\n${failures} 项验证失败`);
  process.exit(1);
}
console.log("\n全部验证通过");
