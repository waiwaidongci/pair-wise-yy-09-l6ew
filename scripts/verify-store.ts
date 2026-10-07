/**
 * store 层端到端验证：v1 数据迁移、导入→应用→快照链路、别名编辑语义。
 * 运行：corepack pnpm dlx tsx scripts/verify-store.ts
 */

// 在导入 store 前垫好 localStorage（store 模块加载即读持久化数据）
const store_map = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => store_map.get(key) ?? null,
  setItem: (key: string, value: string) => void store_map.set(key, String(value)),
  removeItem: (key: string) => void store_map.delete(key),
};

const STORAGE_KEY = "token-forge-workspace-v1";

// 预置 v1 数据：无 version 字段、草稿里带 {ref} 字面量、一个旧快照
store_map.set(
  STORAGE_KEY,
  JSON.stringify({
    themes: [
      {
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
      },
    ],
    activeThemeId: "theme-old",
    snapshots: [
      {
        id: "snapshot-1",
        label: "历史发布",
        createdAt: "2026/01/01 10:00:00",
        theme: {
          id: "theme-old",
          name: "旧草稿",
          tokens: {
            color: [{ id: "c1", name: "color.brand", value: "#0b0b0b", description: "" }],
            fontSize: [],
            spacing: [],
            radius: [],
            shadow: [],
            motion: [],
          },
        },
      },
    ],
  }),
);

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name}`, extra ?? "");
  }
}

const { useTokenStore } = await import("../src/stores/tokenStore");
const store = useTokenStore();

console.log("— v1 迁移：旧草稿按现值升级 —");
{
  const theme = store.themes().find((t) => t.id === "theme-old")!;
  const accent = theme.tokens.color.find((t) => t.id === "c2")!;
  check("{ref} 字面量固化为现值", accent.value === "#0a0a0a", accent);
  check("不保留 ref 元数据", !accent.ref);
  const snapshot = store.snapshots()[0];
  check("旧快照补齐冻结解析值", snapshot.resolved?.["color.brand"] === "#0b0b0b", snapshot.resolved);
  check("迁移后写回 v2", JSON.parse(store_map.get(STORAGE_KEY)!).version === 2);
}

console.log("— 导入 → 应用 → 快照链路 —");
{
  store.importPackage(
    JSON.stringify({
      name: "品牌令牌包",
      version: "2.0.0",
      expiresAt: "2999-12-31",
      color: {
        brand: { value: "#123456", type: "color" },
        accent: { value: "{color.brand}" },
      },
    }),
  );
  check("生成待应用修订", store.revisions().length === 1 && store.revisions()[0].status === "pending");

  // 编辑中再收一版同包导入 → 续作到同一修订
  store.importPackage(
    JSON.stringify({ name: "品牌令牌包", version: "2.1.0", color: { brand: { value: "#654321", type: "color" } } }),
  );
  check("同包续作不增修订", store.revisions().length === 1);
  check("版本前进", store.revisions()[0].version === "2.1.0");
  check("历史版本留存", store.revisions()[0].history.some((h) => h.version === "2.0.0"));

  // 先在别名上做一个显式覆盖，再应用修订
  const accent = store.activeTheme().tokens.color.find((t) => t.name === "color.accent")!;
  store.updateToken("color", accent.id, { value: "{color.brand}" }); // 重建别名
  store.updateToken("color", accent.id, { value: "#ff0000" }); // 显式覆盖
  const covered = store.activeTheme().tokens.color.find((t) => t.name === "color.accent")!;
  check("覆盖标记", covered.overridden === true);

  store.applyRevision(store.revisions()[0].id);
  const applied = store.activeTheme();
  check("修订已应用", store.revisions()[0].status === "applied");
  check("草稿挂接修订", applied.baseRevisionId === store.revisions()[0].id);
  check("基础值按包更新", applied.tokens.color.find((t) => t.name === "color.brand")?.value === "#654321");
  const accentAfter = applied.tokens.color.find((t) => t.name === "color.accent")!;
  check("覆盖值保留", accentAfter.value === "#ff0000");
  check("覆盖标待复核", accentAfter.pendingReview === true, accentAfter);

  // 待确认快照：保存时修订已应用 → 非待确认；先造一个 pending 修订再存
  store.saveSnapshot("发布 A");
  const snapA = store.snapshots()[0];
  check("快照冻结解析值", snapA.resolved["color.brand"] === "#654321");
  check("快照记录修订状态", snapA.revisionStatus === "applied");

  store.importPackage(JSON.stringify({ name: "另一包", version: "1.0.0", color: { x: { value: "#000000" } } }));
  store.saveSnapshot("发布 B");
  check("快照记录已应用状态", store.snapshots()[0].revisionStatus === "applied"); // 草稿仍挂在已应用修订上
  check("新包为待应用", store.revisions().some((r) => r.packageName === "另一包" && r.status === "pending"));

  // 已应用修订收到同包新版本 → 回到待应用，期间保存的快照为待确认
  store.importPackage(
    JSON.stringify({ name: "品牌令牌包", version: "3.0.0", color: { brand: { value: "#111222", type: "color" } } }),
  );
  const brandRevision = store.revisions().find((r) => r.packageName === "品牌令牌包")!;
  check("同包再导入不增修订", store.revisions().filter((r) => r.packageName === "品牌令牌包").length === 1);
  check("已应用修订收到新版回到待应用", brandRevision.status === "pending");
  check("版本前进到 3.0.0", brandRevision.version === "3.0.0");
  check("历史版本连续", brandRevision.history.some((h) => h.version === "2.1.0"));
  store.saveSnapshot("发布 C");
  check("待确认快照标记", store.snapshots()[0].revisionStatus === "pending");
}

console.log("— 确认 / 恢复引用 —");
{
  const accent = store.activeTheme().tokens.color.find((t) => t.name === "color.accent")!;
  store.acknowledgeToken("color", accent.id);
  const acked = store.activeTheme().tokens.color.find((t) => t.name === "color.accent")!;
  check("确认后清除待复核", acked.pendingReview === false);
  check("确认后仍是覆盖", acked.overridden === true);

  store.revertTokenOverride("color", accent.id);
  const reverted = store.activeTheme().tokens.color.find((t) => t.name === "color.accent")!;
  check("恢复引用后重算", reverted.overridden === false && reverted.value === "#654321", reverted);
}

console.log("— 持久化 —");
{
  const persisted = JSON.parse(store_map.get(STORAGE_KEY)!);
  check("修订已持久化", persisted.revisions.length === 2);
  check("快照已持久化（含 v1 历史发布）", persisted.snapshots.length === 4, persisted.snapshots.length);
  check("历史发布冻结值未被改写", persisted.snapshots.find((s: { id: string }) => s.id === "snapshot-1")?.resolved?.["color.brand"] === "#0b0b0b");
  check("冲突列表存在", Array.isArray(persisted.conflicts));
}

if (failures > 0) {
  console.error(`\n${failures} 项验证失败`);
  process.exit(1);
}
console.log("\n全部验证通过");
