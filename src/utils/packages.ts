import type { DesignToken, ExportIssue, Theme, TokenKind, TokenPackage } from "../types/tokens";
import {
  TOKEN_KINDS,
  allTokens,
  buildTokenIndex,
  isReference,
  kindFromName,
  parseReference,
  resolveToken,
  signatureOf,
} from "./references";

let packageSeq = 0;
function packageId(name: string): string {
  packageSeq += 1;
  const slug = name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "pkg";
  return `pkg-${slug}`;
}

let tokenSeq = 0;
function tokenId(kind: TokenKind, name: string): string {
  tokenSeq += 1;
  const slug = name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${kind}-${slug || "token"}-${tokenSeq}`;
}

/** 从导入文本解析令牌包；支持 {package:{name,version}, tokens:{...}}、{name,version,tokens:{...}} 与扁平键值 */
export function parsePackage(raw: string): TokenPackage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;

  let name = "导入的令牌包";
  let version = 1;
  let tokensRaw: unknown = null;

  if (root.package && typeof root.package === "object") {
    const meta = root.package as Record<string, unknown>;
    if (typeof meta.name === "string") name = meta.name;
    if (typeof meta.version === "number") version = meta.version;
    tokensRaw = root.tokens;
  } else if (root.tokens && typeof root.tokens === "object") {
    if (typeof root.name === "string") name = root.name;
    if (typeof root.version === "number") version = root.version;
    tokensRaw = root.tokens;
  } else {
    // 扁平 名称→值
    const entries = Object.entries(root).filter(([, value]) => typeof value === "string");
    if (entries.length === 0) return null;
    tokensRaw = Object.fromEntries(entries);
  }

  if (!tokensRaw || typeof tokensRaw !== "object") return null;
  const flat: Record<string, string> = {};
  const walk = (node: unknown, path: string[]): void => {
    if (!node || typeof node !== "object") return;
    Object.entries(node as Record<string, unknown>).forEach(([key, value]) => {
      const nextPath = [...path, key];
      if (typeof value === "string") {
        flat[nextPath.join(".")] = value;
      } else if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (typeof record.value === "string") {
          flat[nextPath.join(".")] = record.value;
        } else {
          walk(record, nextPath);
        }
      }
    });
  };
  walk(tokensRaw, []);
  if (Object.keys(flat).length === 0) return null;

  return {
    id: packageId(name),
    name,
    version,
    tokens: flat,
    importedAt: new Date().toISOString(),
  };
}

/** 用令牌包搭建一套全新主题草稿 */
export function themeFromPackage(pkg: TokenPackage): Theme {
  const tokens = {} as Theme["tokens"];
  TOKEN_KINDS.forEach((kind) => {
    tokens[kind] = [];
  });
  Object.entries(pkg.tokens).forEach(([name, rawValue]) => {
    const kind = kindFromName(name);
    const ref = isReference(rawValue) ? parseReference(rawValue) : null;
    tokens[kind].push({
      id: tokenId(kind, name),
      name,
      value: rawValue,
      description: "从令牌包同步",
      ref: ref ?? undefined,
      syncedValue: rawValue,
    });
  });
  return {
    id: `theme-${Date.now()}`,
    name: pkg.name,
    tokens,
    packageId: pkg.id,
    packageVersion: pkg.version,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * 包同步到已有草稿（可续作修订）：
 * - 未覆盖的别名：保留引用、失效后按新基础值重算；
 * - 显式覆盖：保留覆盖值并标“待复核”；
 * - 基础值：用户未改过则跟随包，用户也改过则两边都留；
 * - 包内新令牌补入，草稿自定义令牌保留。
 */
export function syncThemeWithPackage(theme: Theme, pkg: TokenPackage): Theme {
  const next: Theme = structuredClone(theme);
  next.packageId = pkg.id;
  next.packageVersion = pkg.version;
  next.syncedAt = new Date().toISOString();

  const index = buildTokenIndex(next);
  Object.entries(pkg.tokens).forEach(([name, rawValue]) => {
    const existing = index.get(name);
    const ref = isReference(rawValue) ? parseReference(rawValue) : null;
    if (existing) {
      if (ref) {
        existing.value = rawValue;
        existing.ref = ref;
        if (existing.override !== undefined) {
          // 基础值更新，显式覆盖保留但待复核
          existing.needsReview = true;
        }
      } else {
        const userDiverged =
          existing.override === undefined &&
          existing.syncedValue !== undefined &&
          signatureOf(existing) !== existing.syncedValue;
        if (userDiverged && signatureOf(existing) !== rawValue) {
          existing.conflict = [signatureOf(existing), rawValue];
        } else if (!userDiverged) {
          existing.value = rawValue;
        }
        existing.ref = undefined;
      }
      existing.syncedValue = rawValue;
    } else {
      const kind = kindFromName(name);
      next.tokens[kind].push({
        id: tokenId(kind, name),
        name,
        value: rawValue,
        description: "从令牌包同步",
        ref: ref ?? undefined,
        syncedValue: rawValue,
      });
    }
  });

  revalidateResolutions(next);
  return next;
}

/** 旧草稿（无引用元数据）按当前包现值升级：补引用、清旧覆盖、基线设为现值 */
export function upgradeDraft(theme: Theme, pkg: TokenPackage): Theme {
  const next: Theme = structuredClone(theme);
  next.packageId = pkg.id;
  next.packageVersion = pkg.version;
  next.syncedAt = new Date().toISOString();

  TOKEN_KINDS.forEach((kind) => {
    next.tokens[kind] = next.tokens[kind].map((token) => {
      const pkgValue = pkg.tokens[token.name];
      if (pkgValue === undefined) return token;
      const ref = isReference(pkgValue) ? parseReference(pkgValue) : null;
      return {
        ...token,
        value: pkgValue,
        ref: ref ?? undefined,
        override: undefined,
        needsReview: false,
        conflict: undefined,
        syncedValue: pkgValue,
      };
    });
  });

  // 补齐包内存在但草稿缺失的令牌
  const index = buildTokenIndex(next);
  Object.entries(pkg.tokens).forEach(([name, rawValue]) => {
    if (index.has(name)) return;
    const kind = kindFromName(name);
    const ref = isReference(rawValue) ? parseReference(rawValue) : null;
    next.tokens[kind].push({
      id: tokenId(kind, name),
      name,
      value: rawValue,
      description: "从令牌包升级",
      ref: ref ?? undefined,
      syncedValue: rawValue,
    });
  });

  revalidateResolutions(next);
  return next;
}

/** 重新解析草稿内全部别名：清除失效缓存，暴露成环/缺失 */
export function revalidateResolutions(theme: Theme): ExportIssue[] {
  const index = buildTokenIndex(theme);
  const issues: ExportIssue[] = [];
  allTokens(theme).forEach((token) => {
    if (token.override !== undefined) return;
    const ref = token.ref ?? parseReference(token.value);
    if (!ref) return;
    const result = resolveToken(token, index);
    if (result.issue) issues.push(result.issue);
  });
  return issues;
}

/**
 * 多标签页并发编辑合并（按令牌三方合并）：
 * 以 syncedValue 为基线，仅一侧改动取该侧；两侧改同一令牌且不同值时两边都留。
 */
export function mergeThemes(local: Theme, stored: Theme): Theme {
  const merged: Theme = structuredClone(local);
  const storedIndex = buildTokenIndex(stored);

  TOKEN_KINDS.forEach((kind) => {
    merged.tokens[kind].forEach((localToken) => {
      const storedToken = storedIndex.get(localToken.name);
      if (!storedToken) return;
      const base = localToken.syncedValue ?? storedToken.syncedValue;
      const localSig = signatureOf(localToken);
      const storedSig = signatureOf(storedToken);
      if (base !== undefined && localSig === base && storedSig !== base) {
        // 对侧改过、本地未动 → 采用对侧
        Object.assign(localToken, structuredClone(storedToken));
      } else if (base !== undefined && localSig !== base && storedSig !== base && localSig !== storedSig) {
        // 两边改了同一个令牌且不一致 → 两边都留
        localToken.conflict = [localSig, storedSig];
      }
    });

    // 对侧新增的令牌补入
    const localNames = new Set(merged.tokens[kind].map((token) => token.name));
    stored.tokens[kind].forEach((storedToken) => {
      if (!localNames.has(storedToken.name)) {
        merged.tokens[kind].push(structuredClone(storedToken));
      }
    });
  });

  merged.packageVersion = Math.max(local.packageVersion ?? 0, stored.packageVersion ?? 0) || undefined;
  merged.packageId = local.packageId ?? stored.packageId;
  revalidateResolutions(merged);
  return merged;
}

/** 导出前校验：引用成环、目标缺失、包过期、未决冲突都会拦下导出 */
export function validateTheme(theme: Theme, packages: TokenPackage[]): ExportIssue[] {
  const issues: ExportIssue[] = [];
  const index = buildTokenIndex(theme);

  allTokens(theme).forEach((token) => {
    if (token.conflict?.length) {
      issues.push({ type: "conflict", token: token.name, values: token.conflict });
    }
    if (token.override !== undefined) return;
    const ref = token.ref ?? parseReference(token.value);
    if (!ref) return;
    const result = resolveToken(token, index);
    if (result.issue) issues.push(result.issue);
  });

  if (theme.packageId) {
    const latest = packages
      .filter((pkg) => pkg.id === theme.packageId)
      .reduce<TokenPackage | null>((max, pkg) => (!max || pkg.version > max.version ? pkg : max), null);
    if (latest && (theme.packageVersion ?? 0) < latest.version) {
      issues.push({
        type: "stale",
        packageId: theme.packageId,
        current: theme.packageVersion ?? 0,
        latest: latest.version,
      });
    }
  }

  return issues;
}

export function describeIssue(issue: ExportIssue): string {
  switch (issue.type) {
    case "cycle":
      return `引用成环：${(issue.path ?? []).join(" → ")}`;
    case "missing":
      return `引用目标缺失：${issue.token} 引用了不存在的 ${issue.target}`;
    case "stale":
      return `令牌包已过期：草稿基于 v${issue.current}，最新为 v${issue.latest}`;
    case "conflict":
      return `令牌冲突两边都留：${issue.token}（${(issue.values ?? []).join(" / ")}）`;
  }
}
