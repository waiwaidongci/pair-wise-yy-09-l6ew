import { createEffect, createMemo, createSignal } from "solid-js";
import type { DesignToken, Snapshot, Theme, TokenPackage } from "../types/tokens";
import {
  mergeThemes,
  parsePackage,
  syncThemeWithPackage,
  themeFromPackage,
  upgradeDraft,
  validateTheme,
} from "../utils/packages";
import { referenceOf, TOKEN_KINDS } from "../utils/references";

const STORAGE_KEY = "token-forge-workspace-v1";

const makeTokens = (): Theme["tokens"] => ({
  color: [
    { id: "color-brand", name: "color.brand.primary", value: "#356ae6", description: "品牌主色，用于主操作", syncedValue: "#356ae6" },
    { id: "color-surface", name: "color.surface.default", value: "#ffffff", description: "默认卡片与页面表面", syncedValue: "#ffffff" },
    { id: "color-text", name: "color.text.primary", value: "#172033", description: "正文主文字", syncedValue: "#172033" },
    { id: "color-muted", name: "color.text.muted", value: "#68738a", description: "次级说明文字", syncedValue: "#68738a" },
    { id: "color-success", name: "color.status.success", value: "#16845b", description: "成功状态", syncedValue: "#16845b" },
    { id: "color-danger", name: "color.status.danger", value: "#c53b4d", description: "错误与危险状态", syncedValue: "#c53b4d" },
  ],
  fontSize: [
    { id: "font-xs", name: "font.size.xs", value: "12px", description: "辅助标签", syncedValue: "12px" },
    { id: "font-sm", name: "font.size.sm", value: "14px", description: "表格与控件", syncedValue: "14px" },
    { id: "font-md", name: "font.size.md", value: "16px", description: "正文", syncedValue: "16px" },
    { id: "font-lg", name: "font.size.lg", value: "20px", description: "区块标题", syncedValue: "20px" },
    { id: "font-xl", name: "font.size.xl", value: "28px", description: "页面标题", syncedValue: "28px" },
  ],
  spacing: [
    { id: "space-1", name: "space.1", value: "4px", description: "最小间距", syncedValue: "4px" },
    { id: "space-2", name: "space.2", value: "8px", description: "紧凑间距", syncedValue: "8px" },
    { id: "space-3", name: "space.3", value: "12px", description: "控件内间距", syncedValue: "12px" },
    { id: "space-4", name: "space.4", value: "16px", description: "常规间距", syncedValue: "16px" },
    { id: "space-6", name: "space.6", value: "24px", description: "区块间距", syncedValue: "24px" },
    { id: "space-8", name: "space.8", value: "32px", description: "大区块间距", syncedValue: "32px" },
  ],
  radius: [
    { id: "radius-sm", name: "radius.sm", value: "4px", description: "小控件", syncedValue: "4px" },
    { id: "radius-md", name: "radius.md", value: "8px", description: "卡片与输入框", syncedValue: "8px" },
    { id: "radius-full", name: "radius.full", value: "999px", description: "胶囊标签", syncedValue: "999px" },
  ],
  shadow: [
    { id: "shadow-sm", name: "shadow.sm", value: "0 1px 2px rgb(22 32 51 / 0.08)", description: "轻微抬升", syncedValue: "0 1px 2px rgb(22 32 51 / 0.08)" },
    { id: "shadow-lg", name: "shadow.lg", value: "0 16px 40px rgb(22 32 51 / 0.14)", description: "浮层与弹窗", syncedValue: "0 16px 40px rgb(22 32 51 / 0.14)" },
  ],
  motion: [
    { id: "motion-fast", name: "motion.duration.fast", value: "120ms", description: "即时反馈", syncedValue: "120ms" },
    { id: "motion-base", name: "motion.duration.base", value: "220ms", description: "标准过渡", syncedValue: "220ms" },
    { id: "motion-slow", name: "motion.duration.slow", value: "420ms", description: "强调过渡", syncedValue: "420ms" },
  ],
});

function seedThemes(): Theme[] {
  const light: Theme = { id: "theme-light", name: "企业浅色", tokens: makeTokens() };
  const dark = structuredClone(light);
  dark.id = "theme-dark";
  dark.name = "夜间模式";
  dark.tokens.color = dark.tokens.color.map((token) => {
    if (token.id === "color-surface") return { ...token, value: "#151b28", syncedValue: "#151b28" };
    if (token.id === "color-text") return { ...token, value: "#f4f7ff", syncedValue: "#f4f7ff" };
    if (token.id === "color-muted") return { ...token, value: "#aab4ca", syncedValue: "#aab4ca" };
    return token;
  });
  const dense = structuredClone(light);
  dense.id = "theme-dense";
  dense.name = "高密度运营";
  dense.tokens.fontSize = dense.tokens.fontSize.map((token) => ({
    ...token,
    value: `${Math.max(11, Number.parseInt(token.value, 10) - 1)}px`,
    syncedValue: `${Math.max(11, Number.parseInt(token.value, 10) - 1)}px`,
  }));
  dense.tokens.spacing = dense.tokens.spacing.map((token) => ({
    ...token,
    value: `${Math.max(2, Number.parseInt(token.value, 10) - 2)}px`,
    syncedValue: `${Math.max(2, Number.parseInt(token.value, 10) - 2)}px`,
  }));
  return [light, dark, dense];
}

interface PersistedState {
  version: number;
  themes: Theme[];
  activeThemeId: string;
  snapshots: Snapshot[];
  packages: TokenPackage[];
}

function readPersisted(): PersistedState {
  const fallback: PersistedState = {
    version: 2,
    themes: seedThemes(),
    activeThemeId: "theme-light",
    snapshots: [],
    packages: [],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedState> & { themes?: Theme[] };
    if (!parsed.themes?.length) return fallback;
    return {
      version: 2,
      themes: parsed.themes,
      activeThemeId: parsed.activeThemeId ?? parsed.themes[0].id,
      snapshots: parsed.snapshots ?? [],
      packages: parsed.packages ?? [],
    };
  } catch {
    return fallback;
  }
}

const initial = readPersisted();
const [themes, setThemes] = createSignal<Theme[]>(initial.themes);
const [activeThemeId, setActiveThemeId] = createSignal(initial.activeThemeId);
const [snapshots, setSnapshots] = createSignal<Snapshot[]>(initial.snapshots);
const [packages, setPackages] = createSignal<TokenPackage[]>(initial.packages);

const activeTheme = createMemo(() => themes().find((theme) => theme.id === activeThemeId()) ?? themes()[0]);
const issues = createMemo(() => validateTheme(activeTheme(), packages()));

createEffect(() => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      themes: themes(),
      activeThemeId: activeThemeId(),
      snapshots: snapshots(),
      packages: packages(),
    }),
  );
});

// 多标签页：其他标签页写入后按令牌合并进当前草稿
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const incoming = JSON.parse(event.newValue) as PersistedState;
      if (!incoming.themes?.length) return;
      const currentThemes = themes();
      const mergedThemes = currentThemes.map((local) => {
        const stored = incoming.themes.find((theme) => theme.id === local.id);
        return stored ? mergeThemes(local, stored) : local;
      });
      incoming.themes.forEach((stored) => {
        if (!mergedThemes.some((theme) => theme.id === stored.id)) mergedThemes.push(stored);
      });
      if (JSON.stringify(mergedThemes) !== JSON.stringify(currentThemes)) setThemes(mergedThemes);

      const currentSnapshots = snapshots();
      const knownSnapshotIds = new Set(currentSnapshots.map((snapshot) => snapshot.id));
      const mergedSnapshots = [
        ...currentSnapshots,
        ...incoming.snapshots.filter((snapshot) => !knownSnapshotIds.has(snapshot.id)),
      ].slice(0, 20);
      if (JSON.stringify(mergedSnapshots) !== JSON.stringify(currentSnapshots)) setSnapshots(mergedSnapshots);

      const currentPackages = packages();
      const mergedPackages = [...currentPackages];
      incoming.packages.forEach((incomingPkg) => {
        const index = mergedPackages.findIndex((pkg) => pkg.id === incomingPkg.id);
        if (index === -1) mergedPackages.push(incomingPkg);
        else if (incomingPkg.version > mergedPackages[index].version) mergedPackages[index] = incomingPkg;
      });
      if (JSON.stringify(mergedPackages) !== JSON.stringify(currentPackages)) setPackages(mergedPackages);
    } catch {
      // 忽略损坏的跨标签页消息
    }
  });
}

function updateTheme(themeId: string, updater: (theme: Theme) => Theme): void {
  setThemes((current) => current.map((theme) => (theme.id === themeId ? updater(theme) : theme)));
}

export function useTokenStore() {
  /** 编辑令牌值：别名走显式覆盖（保留引用），基础值直接改值 */
  const updateToken = (kind: (typeof TOKEN_KINDS)[number], id: string, patch: Partial<DesignToken>): void => {
    updateTheme(activeThemeId(), (theme) => ({
      ...theme,
      tokens: {
        ...theme.tokens,
        [kind]: theme.tokens[kind].map((token) => {
          if (token.id !== id) return token;
          const next = { ...token, ...patch };
          if (patch.value !== undefined) {
            const ref = referenceOf(token);
            if (ref) {
              // 编辑别名的有效值 → 显式覆盖，引用保留
              next.value = token.value;
              next.ref = ref;
              next.override = patch.value;
              next.needsReview = false;
            } else {
              next.value = patch.value;
            }
          }
          return next;
        }),
      },
    }));
  };

  const addToken = (kind: (typeof TOKEN_KINDS)[number]): void => {
    updateTheme(activeThemeId(), (theme) => ({
      ...theme,
      tokens: {
        ...theme.tokens,
        [kind]: [
          ...theme.tokens[kind],
          {
            id: `${kind}-${Date.now()}`,
            name: `${kind}.custom.${theme.tokens[kind].length + 1}`,
            value: kind === "color" ? "#4f46e5" : kind === "shadow" ? "0 8px 24px rgb(0 0 0 / 0.12)" : "8px",
            description: "自定义令牌",
            syncedValue: kind === "color" ? "#4f46e5" : kind === "shadow" ? "0 8px 24px rgb(0 0 0 / 0.12)" : "8px",
          },
        ],
      },
    }));
  };

  const removeToken = (kind: (typeof TOKEN_KINDS)[number], id: string): void => {
    updateTheme(activeThemeId(), (theme) => ({
      ...theme,
      tokens: { ...theme.tokens, [kind]: theme.tokens[kind].filter((token) => token.id !== id) },
    }));
  };

  const createTheme = (name: string, sourceId = activeThemeId()): string => {
    const source = themes().find((theme) => theme.id === sourceId) ?? themes()[0];
    const id = `theme-${Date.now()}`;
    setThemes((current) => [...current, { ...structuredClone(source), id, name }]);
    setActiveThemeId(id);
    return id;
  };

  const saveSnapshot = (label: string): void => {
    const snapshot: Snapshot = {
      id: `snapshot-${Date.now()}`,
      label: label.trim() || `快照 ${snapshots().length + 1}`,
      createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      theme: structuredClone(activeTheme()),
    };
    setSnapshots((current) => [snapshot, ...current].slice(0, 20));
  };

  /** 导入令牌包：新建主题草稿，或把当前草稿续作到新包（旧草稿按现值升级） */
  const importPackage = (raw: string, mode: "new" | "sync"): { ok: boolean; error?: string } => {
    const pkg = parsePackage(raw);
    if (!pkg) return { ok: false, error: "无法解析令牌包内容" };
    setPackages((current) => {
      const index = current.findIndex((item) => item.id === pkg.id);
      if (index === -1) return [...current, pkg];
      const next = [...current];
      next[index] = pkg;
      return next;
    });
    if (mode === "new") {
      const theme = themeFromPackage(pkg);
      setThemes((current) => [...current, theme]);
      setActiveThemeId(theme.id);
    } else {
      const current = activeTheme();
      const revised = current.packageId ? syncThemeWithPackage(current, pkg) : upgradeDraft(current, pkg);
      setThemes((list) => list.map((theme) => (theme.id === current.id ? revised : theme)));
    }
    return { ok: true };
  };

  /** 恢复别名引用：清除显式覆盖，按当前基础值重算 */
  const restoreReference = (kind: (typeof TOKEN_KINDS)[number], id: string): void => {
    updateTheme(activeThemeId(), (theme) => ({
      ...theme,
      tokens: {
        ...theme.tokens,
        [kind]: theme.tokens[kind].map((token) =>
          token.id === id ? { ...token, override: undefined, needsReview: false } : token,
        ),
      },
    }));
  };

  /** 冲突解决：采用某一边的值，清除冲突标记 */
  const resolveConflict = (kind: (typeof TOKEN_KINDS)[number], id: string, value: string): void => {
    updateTheme(activeThemeId(), (theme) => ({
      ...theme,
      tokens: {
        ...theme.tokens,
        [kind]: theme.tokens[kind].map((token) => {
          if (token.id !== id) return token;
          const refMatch = value.match(/^\{([^{}]+)\}$/);
          if (refMatch) {
            return { ...token, value, ref: refMatch[1], override: undefined, needsReview: false, conflict: undefined };
          }
          const ref = referenceOf(token);
          if (ref) {
            return { ...token, value: `{${ref}}`, ref, override: value, needsReview: false, conflict: undefined };
          }
          return { ...token, value, conflict: undefined };
        }),
      },
    }));
  };

  const reset = (): void => {
    const fresh = seedThemes();
    setThemes(fresh);
    setActiveThemeId(fresh[0].id);
    setSnapshots([]);
    setPackages([]);
  };

  return {
    themes,
    activeTheme,
    activeThemeId,
    setActiveThemeId,
    snapshots,
    packages,
    issues,
    updateToken,
    addToken,
    removeToken,
    createTheme,
    saveSnapshot,
    importPackage,
    restoreReference,
    resolveConflict,
    reset,
  };
}
