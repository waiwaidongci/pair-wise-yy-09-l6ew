import { createEffect, createMemo, createSignal } from "solid-js";
import type {
  DesignToken,
  ImportRevision,
  PersistedState,
  Snapshot,
  Theme,
  TokenConflict,
  TokenKind,
} from "../types/tokens";
import { TOKEN_KINDS } from "../types/tokens";
import { parseRefValue, recomputeAliases, resolveTheme, resolvedValues } from "../utils/refs";
import { DELETED_MARK, mergePersistedState } from "../utils/merge";
import { applyRevisionToTheme, parseImportedPackage } from "../utils/importers";

const STORAGE_KEY = "token-forge-workspace-v1";
const STORAGE_VERSION = 2;
/** 当前标签页标识，用于区分 storage 事件来源 */
const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const makeTokens = (): Theme["tokens"] => ({
  color: [
    { id: "color-brand", name: "color.brand.primary", value: "#356ae6", description: "品牌主色，用于主操作" },
    {
      id: "color-brand-hover",
      name: "color.brand.hover",
      value: "{color.brand.primary}",
      ref: "color.brand.primary",
      description: "悬停态，默认引用品牌主色",
    },
    { id: "color-surface", name: "color.surface.default", value: "#ffffff", description: "默认卡片与页面表面" },
    { id: "color-text", name: "color.text.primary", value: "#172033", description: "正文主文字" },
    { id: "color-muted", name: "color.text.muted", value: "#68738a", description: "次级说明文字" },
    { id: "color-success", name: "color.status.success", value: "#16845b", description: "成功状态" },
    { id: "color-danger", name: "color.status.danger", value: "#c53b4d", description: "错误与危险状态" },
    {
      id: "color-danger-surface",
      name: "color.danger.surface",
      value: "{color.status.danger}",
      ref: "color.status.danger",
      description: "危险状态底色，引用危险色",
    },
  ],
  fontSize: [
    { id: "font-xs", name: "font.size.xs", value: "12px", description: "辅助标签" },
    { id: "font-sm", name: "font.size.sm", value: "14px", description: "表格与控件" },
    { id: "font-md", name: "font.size.md", value: "16px", description: "正文" },
    { id: "font-lg", name: "font.size.lg", value: "20px", description: "区块标题" },
    { id: "font-xl", name: "font.size.xl", value: "28px", description: "页面标题" },
  ],
  spacing: [
    { id: "space-1", name: "space.1", value: "4px", description: "最小间距" },
    { id: "space-2", name: "space.2", value: "8px", description: "紧凑间距" },
    { id: "space-3", name: "space.3", value: "12px", description: "控件内间距" },
    { id: "space-4", name: "space.4", value: "16px", description: "常规间距" },
    { id: "space-6", name: "space.6", value: "24px", description: "区块间距" },
    { id: "space-8", name: "space.8", value: "32px", description: "大区块间距" },
  ],
  radius: [
    { id: "radius-sm", name: "radius.sm", value: "4px", description: "小控件" },
    { id: "radius-md", name: "radius.md", value: "8px", description: "卡片与输入框" },
    { id: "radius-full", name: "radius.full", value: "999px", description: "胶囊标签" },
  ],
  shadow: [
    { id: "shadow-sm", name: "shadow.sm", value: "0 1px 2px rgb(22 32 51 / 0.08)", description: "轻微抬升" },
    { id: "shadow-lg", name: "shadow.lg", value: "0 16px 40px rgb(22 32 51 / 0.14)", description: "浮层与弹窗" },
  ],
  motion: [
    { id: "motion-fast", name: "motion.duration.fast", value: "120ms", description: "即时反馈" },
    { id: "motion-base", name: "motion.duration.base", value: "220ms", description: "标准过渡" },
    { id: "motion-slow", name: "motion.duration.slow", value: "420ms", description: "强调过渡" },
  ],
});

function seedThemes(): Theme[] {
  const light: Theme = { id: "theme-light", name: "企业浅色", tokens: makeTokens(), baseRevisionId: null };
  const dark = structuredClone(light);
  dark.id = "theme-dark";
  dark.name = "夜间模式";
  dark.tokens.color = dark.tokens.color.map((token) => {
    if (token.id === "color-surface") return { ...token, value: "#151b28" };
    if (token.id === "color-text") return { ...token, value: "#f4f7ff" };
    if (token.id === "color-muted") return { ...token, value: "#aab4ca" };
    return token;
  });
  const dense = structuredClone(light);
  dense.id = "theme-dense";
  dense.name = "高密度运营";
  dense.tokens.fontSize = dense.tokens.fontSize.map((token) => ({
    ...token,
    value: `${Math.max(11, Number.parseInt(token.value, 10) - 1)}px`,
  }));
  dense.tokens.spacing = dense.tokens.spacing.map((token) => ({
    ...token,
    value: `${Math.max(2, Number.parseInt(token.value, 10) - 2)}px`,
  }));
  return [light, dark, dense].map((theme) => recomputeAliases(theme).theme);
}

function emptyState(): PersistedState {
  return {
    version: STORAGE_VERSION,
    themes: seedThemes(),
    activeThemeId: "theme-light",
    snapshots: [],
    revisions: [],
    conflicts: [],
  };
}

/**
 * v1 草稿没有引用元数据：把 "{...}" 字面量按现值解析后固化为普通值，
 * 其余令牌原样保留，即“旧草稿缺引用按现值升级”。
 */
function upgradeLegacyTheme(theme: Theme): Theme {
  const { values } = resolveTheme(theme);
  const tokens = {} as Theme["tokens"];
  TOKEN_KINDS.forEach((kind) => {
    tokens[kind] = (theme.tokens?.[kind] ?? []).map((token) => {
      const ref = token.ref ?? parseRefValue(token.value);
      if (!ref) return { ...token };
      return {
        ...token,
        value: values[token.name] || token.value,
        ref: null,
        overridden: false,
        pendingReview: false,
        overrideBaseValue: null,
      };
    });
  });
  return recomputeAliases({ ...theme, tokens, baseRevisionId: theme.baseRevisionId ?? null }).theme;
}

function migratePersisted(raw: unknown): PersistedState {
  const fallback = emptyState();
  if (!raw || typeof raw !== "object") return fallback;
  const parsed = raw as Partial<PersistedState>;
  if (!Array.isArray(parsed.themes) || parsed.themes.length === 0) return fallback;
  const legacy = parsed.version !== STORAGE_VERSION;
  const themes = parsed.themes.map((theme) => (legacy ? upgradeLegacyTheme(theme) : recomputeAliases(theme).theme));
  const snapshots = Array.isArray(parsed.snapshots)
    ? parsed.snapshots.map((snapshot) => {
        // 历史发布仍按原快照导出：冻结主题自身解析，不跟随现值
        const theme = legacy ? upgradeLegacyTheme(snapshot.theme) : recomputeAliases(snapshot.theme).theme;
        return {
          ...snapshot,
          theme,
          resolved: snapshot.resolved ?? resolvedValues(theme),
          revisionId: snapshot.revisionId ?? null,
          revisionStatus: snapshot.revisionStatus ?? null,
        };
      })
    : [];
  return {
    version: STORAGE_VERSION,
    themes,
    activeThemeId: typeof parsed.activeThemeId === "string" ? parsed.activeThemeId : themes[0].id,
    snapshots,
    revisions: Array.isArray(parsed.revisions) ? parsed.revisions : [],
    conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
  };
}

/** localStorage 在隐私模式/SSR 下可能不可用，读写都做防御 */
const storage = {
  get(): string | null {
    try {
      return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  },
  set(value: string): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, value);
    } catch {
      // 忽略写入失败
    }
  },
};

function readRaw(): unknown {
  try {
    const raw = storage.get();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const rawPersisted = readRaw();
const initial = migratePersisted(rawPersisted);

const [themes, setThemes] = createSignal<Theme[]>(initial.themes);
const [activeThemeId, setActiveThemeId] = createSignal(initial.activeThemeId);
const [snapshots, setSnapshots] = createSignal<Snapshot[]>(initial.snapshots);
const [revisions, setRevisions] = createSignal<ImportRevision[]>(initial.revisions);
const [conflicts, setConflicts] = createSignal<TokenConflict[]>(initial.conflicts);

const activeTheme = createMemo(() => themes().find((theme) => theme.id === activeThemeId()) ?? themes()[0]);
const activeRevision = createMemo<ImportRevision | null>(() => {
  const id = activeTheme()?.baseRevisionId;
  return id ? revisions().find((revision) => revision.id === id) ?? null : null;
});

const stateSnapshot = (): PersistedState => ({
  version: STORAGE_VERSION,
  themes: themes(),
  activeThemeId: activeThemeId(),
  snapshots: snapshots(),
  revisions: revisions(),
  conflicts: conflicts(),
});

/** 两端最近一次同步的状态，作为跨标签页三路合并的 base；初始为空，迁移结果随即写回 */
let lastSyncedJson = "";

const writePersisted = (state: PersistedState): void => {
  lastSyncedJson = JSON.stringify(state);
  storage.set(JSON.stringify({ ...state, origin: TAB_ID }));
};

createEffect(() => {
  const state = stateSnapshot();
  if (JSON.stringify(state) === lastSyncedJson) return;
  writePersisted(state);
});

function applyState(state: PersistedState): void {
  setThemes(state.themes);
  setActiveThemeId(state.activeThemeId);
  setSnapshots(state.snapshots);
  setRevisions(state.revisions);
  setConflicts(state.conflicts);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const envelope = JSON.parse(event.newValue) as PersistedState & { origin?: string };
      if (envelope.origin === TAB_ID) return;
      const remote = migratePersisted(envelope);
      const base = lastSyncedJson ? (JSON.parse(lastSyncedJson) as PersistedState) : null;
      // 两个标签页同时改同一主题：按令牌三路合并，冲突两侧值都保留
      const merged = mergePersistedState(base, stateSnapshot(), remote);
      const mergedJson = JSON.stringify(merged);
      lastSyncedJson = mergedJson;
      applyState(merged);
      if (mergedJson !== JSON.stringify(remote)) {
        // 本侧有未同步编辑，回写合并结果让两端收敛
        storage.set(JSON.stringify({ ...merged, origin: TAB_ID }));
      }
    } catch {
      // 忽略无法解析的同步负载
    }
  });
}

function updateTheme(themeId: string, updater: (theme: Theme) => Theme): void {
  setThemes((current) =>
    current.map((theme) => (theme.id === themeId ? recomputeAliases(updater(theme)).theme : theme)),
  );
}

export function useTokenStore() {
  const updateToken = (kind: TokenKind, id: string, patch: Partial<DesignToken>): void => {
    updateTheme(activeThemeId(), (theme) => {
      const resolved = patch.value !== undefined ? resolveTheme(theme).values : null;
      return {
        ...theme,
        tokens: {
          ...theme.tokens,
          [kind]: theme.tokens[kind].map((token) => {
            if (token.id !== id) return token;
            const next = { ...token, ...patch };
            if (patch.value !== undefined) {
              const refLiteral = parseRefValue(patch.value);
              if (refLiteral) {
                // 输入 {token.path} 视为设置别名引用
                next.ref = refLiteral;
                next.overridden = false;
                next.pendingReview = false;
                next.overrideBaseValue = null;
              } else if (token.ref && !token.overridden) {
                // 对别名显式填值 → 记为覆盖，记录当前目标值用于漂移检测
                next.overridden = true;
                next.overrideBaseValue = token.ref ? resolved?.[token.ref] || null : null;
                next.pendingReview = false;
              }
            }
            return next;
          }),
        },
      };
    });
  };

  const addToken = (kind: TokenKind): void => {
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
          },
        ],
      },
    }));
  };

  const removeToken = (kind: TokenKind, id: string): void => {
    updateTheme(activeThemeId(), (theme) => ({
      ...theme,
      tokens: { ...theme.tokens, [kind]: theme.tokens[kind].filter((token) => token.id !== id) },
    }));
  };

  /** 确认覆盖：以当前目标解析值为新基准，清除待复核 */
  const acknowledgeToken = (kind: TokenKind, id: string): void => {
    updateTheme(activeThemeId(), (theme) => {
      const target = theme.tokens[kind].find((token) => token.id === id);
      const baseValue = target?.ref ? resolveTheme(theme).values[target.ref] || null : null;
      return {
        ...theme,
        tokens: {
          ...theme.tokens,
          [kind]: theme.tokens[kind].map((token) =>
            token.id === id ? { ...token, pendingReview: false, overrideBaseValue: baseValue ?? token.overrideBaseValue } : token,
          ),
        },
      };
    });
  };

  /** 放弃覆盖，恢复为别名引用并重算 */
  const revertTokenOverride = (kind: TokenKind, id: string): void => {
    updateTheme(activeThemeId(), (theme) => ({
      ...theme,
      tokens: {
        ...theme.tokens,
        [kind]: theme.tokens[kind].map((token) =>
          token.id === id
            ? { ...token, overridden: false, pendingReview: false, overrideBaseValue: null }
            : token,
        ),
      },
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
    const theme = activeTheme();
    const revision = theme.baseRevisionId ? revisions().find((item) => item.id === theme.baseRevisionId) : undefined;
    const snapshot: Snapshot = {
      id: `snapshot-${Date.now()}`,
      label: label.trim() || `快照 ${snapshots().length + 1}`,
      createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      theme: structuredClone(theme),
      resolved: resolvedValues(theme),
      revisionId: theme.baseRevisionId ?? null,
      revisionStatus: revision?.status ?? null,
    };
    setSnapshots((current) => [snapshot, ...current].slice(0, 20));
  };

  /** 解析外部令牌包为可续作修订：同包再导入续版本历史并回到待应用，不丢旧解析结果 */
  const importPackage = (raw: string): ImportRevision => {
    const parsed = parseImportedPackage(raw);
    const now = new Date().toISOString();
    const existing = revisions().find((revision) => revision.packageName === parsed.packageName);
    const revision: ImportRevision = existing
      ? {
          ...existing,
          version: parsed.version,
          importedAt: now,
          expiresAt: parsed.expiresAt,
          tokens: parsed.tokens,
          // 新版本到位后修订回到待应用，基于它的草稿与快照随之进入待确认
          status: "pending",
          history: [...existing.history, { version: existing.version, importedAt: existing.importedAt }].filter(
            (entry, index, all) =>
              all.findIndex((item) => item.version === entry.version && item.importedAt === entry.importedAt) === index,
          ),
        }
      : {
          id: `revision-${Date.now()}`,
          packageName: parsed.packageName,
          version: parsed.version,
          importedAt: now,
          expiresAt: parsed.expiresAt,
          status: "pending",
          tokens: parsed.tokens,
          history: [],
        };
    setRevisions((current) =>
      existing ? current.map((item) => (item.id === existing.id ? revision : item)) : [revision, ...current],
    );
    return revision;
  };

  /** 把修订应用到当前主题草稿：未覆盖别名重算，显式覆盖保留并标待复核 */
  const applyRevision = (revisionId: string): void => {
    const revision = revisions().find((item) => item.id === revisionId);
    if (!revision) return;
    updateTheme(activeThemeId(), (theme) => applyRevisionToTheme(theme, revision));
    setRevisions((current) =>
      current.map((item) => (item.id === revisionId ? { ...item, status: "applied" } : item)),
    );
  };

  const createThemeFromRevision = (revisionId: string): string => {
    const revision = revisions().find((item) => item.id === revisionId);
    if (!revision) return activeThemeId();
    const id = `theme-${Date.now()}`;
    const theme: Theme = {
      id,
      name: `${revision.packageName} ${revision.version}`,
      tokens: structuredClone(revision.tokens),
      baseRevisionId: revision.id,
    };
    setThemes((current) => [...current, recomputeAliases(theme).theme]);
    setActiveThemeId(id);
    setRevisions((current) =>
      current.map((item) => (item.id === revisionId ? { ...item, status: "applied" } : item)),
    );
    return id;
  };

  const removeRevision = (revisionId: string): void => {
    setRevisions((current) => current.filter((item) => item.id !== revisionId));
  };

  /** 取舍合并冲突：保留当前值或改用另一侧的值（另一侧已删除则移除令牌） */
  const resolveConflict = (conflictId: string, choice: "current" | "incoming"): void => {
    const conflict = conflicts().find((item) => item.id === conflictId);
    if (conflict && choice === "incoming") {
      setThemes((current) =>
        current.map((theme) => {
          if (theme.id !== conflict.themeId) return theme;
          const list =
            conflict.incomingValue === DELETED_MARK
              ? theme.tokens[conflict.kind].filter((token) => token.id !== conflict.tokenId)
              : theme.tokens[conflict.kind].map((token) =>
                  token.id === conflict.tokenId ? { ...token, value: conflict.incomingValue } : token,
                );
          return recomputeAliases({ ...theme, tokens: { ...theme.tokens, [conflict.kind]: list } }).theme;
        }),
      );
    }
    setConflicts((current) => current.filter((item) => item.id !== conflictId));
  };

  return {
    themes,
    activeTheme,
    activeThemeId,
    setActiveThemeId,
    snapshots,
    revisions,
    conflicts,
    activeRevision,
    updateToken,
    addToken,
    removeToken,
    acknowledgeToken,
    revertTokenOverride,
    createTheme,
    saveSnapshot,
    importPackage,
    applyRevision,
    createThemeFromRevision,
    removeRevision,
    resolveConflict,
    reset: () => {
      const fresh = seedThemes();
      setThemes(fresh);
      setActiveThemeId(fresh[0].id);
      setSnapshots([]);
      setRevisions([]);
      setConflicts([]);
    },
  };
}
