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

/** 冲突记录中“另一侧已删除该令牌”的标记值 */
export const DELETED_MARK = "（另一侧已删除）";

const tokenSignature = (token: DesignToken): string =>
  JSON.stringify([
    token.name,
    token.value,
    token.description,
    token.ref ?? null,
    !!token.overridden,
    !!token.pendingReview,
  ]);

const tokenSame = (a: DesignToken, b: DesignToken): boolean => tokenSignature(a) === tokenSignature(b);

/** 序列化后字典序较大者胜出，保证两个标签页算出同一合并结果（收敛、不震荡） */
const pickDeterministic = <T>(a: T, b: T): T => (JSON.stringify(a) >= JSON.stringify(b) ? a : b);

function mergeScalar<T extends string | null>(base: T | null, local: T, remote: T): T {
  if (local === remote) return local;
  if (local === base) return remote;
  if (remote === base) return local;
  return pickDeterministic(local, remote);
}

const now = (): string => new Date().toLocaleString("zh-CN", { hour12: false });

function mergeTokenList(
  base: DesignToken[],
  local: DesignToken[],
  remote: DesignToken[],
  themeId: string,
  kind: TokenKind,
  conflicts: TokenConflict[],
): DesignToken[] {
  const byId = new Map<string, DesignToken>();
  const ids = new Set<string>();
  [base, local, remote].forEach((list) => list.forEach((token) => ids.add(token.id)));

  ids.forEach((id) => {
    const b = base.find((token) => token.id === id) ?? null;
    const l = local.find((token) => token.id === id) ?? null;
    const r = remote.find((token) => token.id === id) ?? null;

    if (l && r) {
      const localChanged = !b || !tokenSame(l, b);
      const remoteChanged = !b || !tokenSame(r, b);
      if (!localChanged && !remoteChanged) byId.set(id, l);
      else if (!localChanged) byId.set(id, r);
      else if (!remoteChanged) byId.set(id, l);
      else if (tokenSame(l, r)) byId.set(id, l);
      else {
        // 同一令牌两侧都改且不一致：确定性保留一侧，另一侧值留在冲突记录里（两边都留）
        const winner = pickDeterministic(l, r);
        const loser = winner === l ? r : l;
        byId.set(id, winner);
        conflicts.push({
          id: `conflict-${themeId}-${id}`,
          themeId,
          kind,
          tokenId: id,
          name: winner.name,
          currentValue: winner.value,
          incomingValue: loser.value,
          detectedAt: now(),
        });
      }
      return;
    }

    const present = l ?? r;
    if (!present) return;
    if (!b) {
      byId.set(id, present); // 单侧新增
      return;
    }
    if (tokenSame(present, b)) return; // 另一侧删除且本侧未改 → 接受删除
    // 一侧删除 vs 另一侧修改：保留修改并记录冲突
    byId.set(id, present);
    conflicts.push({
      id: `conflict-${themeId}-${id}`,
      themeId,
      kind,
      tokenId: id,
      name: present.name,
      currentValue: present.value,
      incomingValue: DELETED_MARK,
      detectedAt: now(),
    });
  });

  // 顺序确定性：base 顺序优先，新增令牌按 id 排序，保证两端一致
  const baseOrder = base.map((token) => token.id);
  return [...byId.values()].sort((a, bToken) => {
    const ia = baseOrder.indexOf(a.id);
    const ib = baseOrder.indexOf(bToken.id);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.id < bToken.id ? -1 : a.id > bToken.id ? 1 : 0;
  });
}

function mergeTheme(base: Theme | null, local: Theme, remote: Theme, conflicts: TokenConflict[]): Theme {
  const tokens = {} as Theme["tokens"];
  TOKEN_KINDS.forEach((kind) => {
    tokens[kind] = mergeTokenList(
      base?.tokens[kind] ?? [],
      local.tokens[kind] ?? [],
      remote.tokens[kind] ?? [],
      local.id,
      kind,
      conflicts,
    );
  });
  return {
    id: local.id,
    name: mergeScalar(base?.name ?? null, local.name, remote.name),
    tokens,
    baseRevisionId: mergeScalar(base?.baseRevisionId ?? null, local.baseRevisionId ?? null, remote.baseRevisionId ?? null),
  };
}

function mergeThemeList(base: Theme[], local: Theme[], remote: Theme[], conflicts: TokenConflict[]): Theme[] {
  const byId = new Map<string, Theme>();
  const ids = new Set<string>();
  [base, local, remote].forEach((list) => list.forEach((theme) => ids.add(theme.id)));
  ids.forEach((id) => {
    const b = base.find((theme) => theme.id === id) ?? null;
    const l = local.find((theme) => theme.id === id) ?? null;
    const r = remote.find((theme) => theme.id === id) ?? null;
    if (l && r) byId.set(id, mergeTheme(b, l, r, conflicts));
    else if (l ?? r) byId.set(id, (l ?? r)!);
  });
  const baseOrder = base.map((theme) => theme.id);
  return [...byId.values()].sort((a, bTheme) => {
    const ia = baseOrder.indexOf(a.id);
    const ib = baseOrder.indexOf(bTheme.id);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.id < bTheme.id ? -1 : a.id > bTheme.id ? 1 : 0;
  });
}

function mergeSnapshots(local: Snapshot[], remote: Snapshot[]): Snapshot[] {
  const byId = new Map<string, Snapshot>();
  [...local, ...remote].forEach((snapshot) => {
    const existing = byId.get(snapshot.id);
    byId.set(snapshot.id, existing ? pickDeterministic(existing, snapshot) : snapshot);
  });
  return [...byId.values()].sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0)).slice(0, 20);
}

function mergeRevision(a: ImportRevision, b: ImportRevision): ImportRevision {
  // 状态以较新的一条为准（新导入会回到待应用）；时间相同则已应用优先
  const newer =
    a.importedAt === b.importedAt
      ? a.status === "applied"
        ? a
        : b
      : a.importedAt > b.importedAt
        ? a
        : b;
  const older = newer === a ? b : a;
  const history = [...a.history, ...b.history].filter(
    (entry, index, all) =>
      all.findIndex((item) => item.version === entry.version && item.importedAt === entry.importedAt) === index,
  );
  return {
    ...newer,
    status: newer.status,
    history,
    tokens: newer.tokens,
    expiresAt: newer.expiresAt ?? older.expiresAt,
  };
}

function mergeRevisions(local: ImportRevision[], remote: ImportRevision[]): ImportRevision[] {
  const byId = new Map<string, ImportRevision>();
  [...local, ...remote].forEach((revision) => {
    const existing = byId.get(revision.id);
    byId.set(revision.id, existing ? mergeRevision(existing, revision) : revision);
  });
  // 同一令牌包的待应用修订折叠到最新一条，避免两个标签页各自导入产生重复
  const pendingByPackage = new Map<string, ImportRevision[]>();
  byId.forEach((revision) => {
    if (revision.status !== "pending") return;
    const group = pendingByPackage.get(revision.packageName) ?? [];
    group.push(revision);
    pendingByPackage.set(revision.packageName, group);
  });
  pendingByPackage.forEach((group) => {
    if (group.length < 2) return;
    const sorted = [...group].sort((a, b) => (a.importedAt > b.importedAt ? -1 : 1));
    const keeper = sorted[0];
    byId.set(keeper.id, sorted.slice(1).reduce((acc, item) => mergeRevision(acc, item), keeper));
    sorted.slice(1).forEach((item) => byId.delete(item.id));
  });
  return [...byId.values()].sort((a, b) =>
    a.importedAt === b.importedAt ? (a.id < b.id ? -1 : 1) : a.importedAt > b.importedAt ? -1 : 1,
  );
}

function mergeConflicts(local: TokenConflict[], remote: TokenConflict[]): TokenConflict[] {
  const byId = new Map<string, TokenConflict>();
  [...local, ...remote].forEach((conflict) => {
    const existing = byId.get(conflict.id);
    byId.set(conflict.id, existing ? pickDeterministic(existing, conflict) : conflict);
  });
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 跨标签页三路合并：base 为两端最近一次同步状态。
 * 按主题 → 令牌逐层合并；同令牌不同值的冲突两侧值都保留在冲突记录中。
 */
export function mergePersistedState(
  base: PersistedState | null,
  local: PersistedState,
  remote: PersistedState,
): PersistedState {
  const detected: TokenConflict[] = [];
  const themes = mergeThemeList(base?.themes ?? [], local.themes, remote.themes, detected);
  return {
    version: local.version,
    themes,
    activeThemeId: mergeScalar(base?.activeThemeId ?? null, local.activeThemeId, remote.activeThemeId),
    snapshots: mergeSnapshots(local.snapshots, remote.snapshots),
    revisions: mergeRevisions(local.revisions, remote.revisions),
    conflicts: mergeConflicts(mergeConflicts(local.conflicts, remote.conflicts), detected),
  };
}
