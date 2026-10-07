import type { ImportRevision, Theme } from "../types/tokens";
import { TOKEN_KINDS } from "../types/tokens";

const REF_PATTERN = /^\{([^{}]+)\}$/;

/** 解析 "{color.brand.primary}" 形式的引用字面量，非引用返回 null */
export function parseRefValue(value: string): string | null {
  const match = value.trim().match(REF_PATTERN);
  return match ? match[1].trim() : null;
}

export interface RefIssue {
  type: "cycle" | "missing";
  /** 触发问题的令牌名 */
  token: string;
  /** 环路径或缺失的目标名 */
  detail: string;
}

export interface Resolution {
  values: Record<string, string>;
  issues: RefIssue[];
}

/**
 * 解析主题内全部令牌：别名沿 ref 递归求值，显式覆盖的令牌以覆盖值为准。
 * 引用成环或目标缺失时记录问题并回退到令牌缓存值，保证本批编辑不丢。
 */
export function resolveTheme(theme: Theme): Resolution {
  const byName = new Map<string, { value: string; ref: string | null }>();
  TOKEN_KINDS.forEach((kind) => {
    (theme.tokens[kind] ?? []).forEach((token) => {
      if (byName.has(token.name)) return;
      const ref = token.overridden ? null : token.ref ?? parseRefValue(token.value);
      byName.set(token.name, { value: token.value, ref });
    });
  });

  const values: Record<string, string> = {};
  const issues: RefIssue[] = [];
  const seen = new Set<string>();
  const pushIssue = (issue: RefIssue) => {
    const key = `${issue.type}:${issue.token}:${issue.detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  };

  const visit = (name: string, stack: string[]): string => {
    if (name in values) return values[name];
    const token = byName.get(name);
    if (!token) {
      pushIssue({ type: "missing", token: stack[stack.length - 1] ?? name, detail: name });
      return "";
    }
    if (stack.includes(name)) {
      const cycle = [...stack.slice(stack.indexOf(name)), name].join(" → ");
      pushIssue({ type: "cycle", token: name, detail: cycle });
      return token.value;
    }
    if (!token.ref) {
      values[name] = token.value;
      return token.value;
    }
    const resolved = visit(token.ref, [...stack, name]);
    values[name] = resolved;
    return resolved;
  };

  byName.forEach((_, name) => {
    visit(name, []);
  });
  return { values, issues };
}

/** 解析结果扁平表；解析失败的令牌回退到缓存值，保证导出/快照可用 */
export function resolvedValues(theme: Theme): Record<string, string> {
  const { values } = resolveTheme(theme);
  const flat: Record<string, string> = {};
  TOKEN_KINDS.forEach((kind) => {
    (theme.tokens[kind] ?? []).forEach((token) => {
      flat[token.name] = values[token.name] || token.value;
    });
  });
  return flat;
}

/**
 * 基础值变化后重算别名缓存：
 * - 未覆盖的别名按最新解析结果刷新（失效重算）；
 * - 显式覆盖保留原值，目标解析值相对覆盖时发生漂移则标待复核。
 */
export function recomputeAliases(theme: Theme): { theme: Theme; issues: RefIssue[] } {
  const tokens = {} as Theme["tokens"];
  TOKEN_KINDS.forEach((kind) => {
    tokens[kind] = [...(theme.tokens[kind] ?? [])];
  });
  const working: Theme = { ...theme, tokens };
  const { values, issues } = resolveTheme(working);

  TOKEN_KINDS.forEach((kind) => {
    tokens[kind] = tokens[kind].map((token) => {
      const ref = token.overridden ? token.ref : token.ref ?? parseRefValue(token.value);
      if (!ref) {
        return token.pendingReview ? { ...token, pendingReview: false } : token;
      }
      if (token.overridden) {
        const target = values[ref];
        const drifted =
          token.overrideBaseValue != null && target !== undefined && target !== "" && token.overrideBaseValue !== target;
        return { ...token, pendingReview: drifted };
      }
      const resolved = values[token.name];
      return resolved && resolved !== token.value ? { ...token, value: resolved } : token;
    });
  });
  return { theme: { ...working, tokens }, issues };
}

export function isRevisionExpired(revision: ImportRevision | null): boolean {
  if (!revision?.expiresAt) return false;
  const time = new Date(revision.expiresAt).getTime();
  return !Number.isNaN(time) && time < Date.now();
}

export interface ExportGate {
  blocked: boolean;
  issues: RefIssue[];
  expired: boolean;
  expiresAt: string | null;
  pendingReviewCount: number;
}

/** 导出前校验：引用成环、目标缺失或包过期时阻止导出（编辑内容保留） */
export function checkExportGate(theme: Theme, revision: ImportRevision | null): ExportGate {
  const { issues } = resolveTheme(theme);
  const expired = isRevisionExpired(revision);
  const pendingReviewCount = TOKEN_KINDS.reduce(
    (count, kind) => count + (theme.tokens[kind] ?? []).filter((token) => token.pendingReview).length,
    0,
  );
  return {
    blocked: issues.length > 0 || expired,
    issues,
    expired,
    expiresAt: revision?.expiresAt ?? null,
    pendingReviewCount,
  };
}
