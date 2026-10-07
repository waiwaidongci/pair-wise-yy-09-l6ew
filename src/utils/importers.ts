import type { DesignToken, ImportRevision, Theme, TokenKind } from "../types/tokens";
import { TOKEN_KINDS } from "../types/tokens";
import { parseRefValue } from "./refs";

export interface ParsedPackage {
  packageName: string;
  version: string;
  expiresAt: string | null;
  tokens: Theme["tokens"];
}

const KIND_HINTS: Record<string, TokenKind> = {
  color: "color",
  colour: "color",
  font: "fontSize",
  fontsize: "fontSize",
  size: "fontSize",
  spacing: "spacing",
  space: "spacing",
  gap: "spacing",
  radius: "radius",
  borderradius: "radius",
  shadow: "shadow",
  elevation: "shadow",
  motion: "motion",
  duration: "motion",
  time: "motion",
  animation: "motion",
};

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z]/g, "");

function inferKind(path: string[], type: string | undefined, value: string): TokenKind {
  const typeKey = type ? normalize(type) : "";
  if (typeKey === "dimension") {
    const head = normalize(path[0] ?? "");
    if (head.includes("radius")) return "radius";
    if (head.includes("font") || head.includes("size")) return "fontSize";
    return "spacing";
  }
  if (typeKey && KIND_HINTS[typeKey]) return KIND_HINTS[typeKey];
  for (const segment of path) {
    const hint = KIND_HINTS[normalize(segment)];
    if (hint) return hint;
  }
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) || value.startsWith("rgb")) return "color";
  if (/^\d+(\.\d+)?m?s$/.test(value)) return "motion";
  if (/px$|rem$|em$/.test(value)) return "spacing";
  return "color";
}

const emptyTokens = (): Theme["tokens"] => ({
  color: [],
  fontSize: [],
  spacing: [],
  radius: [],
  shadow: [],
  motion: [],
});

const tokenId = (name: string): string => `pkg-${name.replace(/[^a-zA-Z0-9]+/g, "-")}`;

/**
 * 解析外部令牌包，支持三种格式：
 * 1. 工作台主题格式：{ name, version, expiresAt, tokens: { color: [...] } }
 * 2. Style Dictionary 嵌套格式：{ color: { brand: { primary: { value, type } } } }
 * 3. 扁平键值格式：{ "color.brand.primary": "#356ae6" }
 * 值为 "{token.path}" 的条目解析为别名引用。
 */
export function parseImportedPackage(raw: string): ParsedPackage {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid-package");

  const packageName =
    typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "外部令牌包";
  const version =
    typeof parsed.version === "string" && parsed.version.trim() ? parsed.version.trim() : "未标注版本";
  const expiresAt =
    typeof parsed.expiresAt === "string" && parsed.expiresAt.trim() ? parsed.expiresAt.trim() : null;
  const tokens = emptyTokens();

  const pushToken = (
    kind: TokenKind,
    entry: { id?: string; name: string; value: string; description?: string; ref?: string | null },
  ) => {
    if (!entry.name || typeof entry.value !== "string" || !entry.value.trim()) return;
    tokens[kind].push({
      id: entry.id ?? tokenId(entry.name),
      name: entry.name,
      value: entry.value,
      description: entry.description ?? "",
      ref: entry.ref ?? parseRefValue(entry.value),
      overridden: false,
      pendingReview: false,
      overrideBaseValue: null,
    });
  };

  const source = (
    parsed.tokens && typeof parsed.tokens === "object" && !Array.isArray(parsed.tokens) ? parsed.tokens : parsed
  ) as Record<string, unknown>;

  if (TOKEN_KINDS.some((kind) => Array.isArray(source[kind]))) {
    // 格式一：工作台主题格式
    TOKEN_KINDS.forEach((kind) => {
      const list = source[kind];
      if (!Array.isArray(list)) return;
      list.forEach((entry: Partial<DesignToken>) => {
        if (!entry || typeof entry.name !== "string") return;
        pushToken(kind, {
          id: typeof entry.id === "string" ? entry.id : undefined,
          name: entry.name,
          value: String(entry.value ?? ""),
          description: typeof entry.description === "string" ? entry.description : "",
          ref: typeof entry.ref === "string" && entry.ref ? entry.ref : undefined,
        });
      });
    });
  } else {
    // 格式二/三：Style Dictionary 嵌套 或 扁平键值
    const META_KEYS = new Set(["name", "version", "expiresAt", "tokens", "description"]);
    const walk = (node: Record<string, unknown>, path: string[]) => {
      Object.entries(node).forEach(([key, value]) => {
        if (path.length === 0 && META_KEYS.has(key)) return;
        if (typeof value === "string" || typeof value === "number") {
          const fullPath = key.includes(".") ? key.split(".") : [...path, key];
          const text = String(value);
          pushToken(inferKind(fullPath, undefined, text), { name: fullPath.join("."), value: text });
          return;
        }
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const record = value as Record<string, unknown>;
          const fullPath = [...path, key];
          if (typeof record.value === "string" || typeof record.value === "number") {
            const text = String(record.value);
            const type = typeof record.type === "string" ? record.type : undefined;
            const description =
              typeof record.comment === "string"
                ? record.comment
                : typeof record.description === "string"
                  ? record.description
                  : "";
            pushToken(inferKind(fullPath, type, text), { name: fullPath.join("."), value: text, description });
          } else {
            walk(record, fullPath);
          }
        }
      });
    };
    walk(source, []);
  }

  if (TOKEN_KINDS.every((kind) => tokens[kind].length === 0)) throw new Error("empty-package");
  return { packageName, version, expiresAt, tokens };
}

/**
 * 把导入修订应用到主题草稿（基础值更新语义）：
 * - 未覆盖的令牌（含别名）采用包内新值，随后统一失效重算；
 * - 显式覆盖保留用户值，引用信息跟随新包，漂移由 recompute 标待复核；
 * - 草稿自有、包内没有的令牌保持不变。
 */
export function applyRevisionToTheme(theme: Theme, revision: ImportRevision): Theme {
  const next = structuredClone(theme);
  next.baseRevisionId = revision.id;
  TOKEN_KINDS.forEach((kind) => {
    const draftTokens = next.tokens[kind] ?? [];
    (revision.tokens[kind] ?? []).forEach((pkgToken) => {
      const draft = draftTokens.find((token) => token.name === pkgToken.name);
      if (!draft) {
        draftTokens.push({ ...pkgToken });
        return;
      }
      if (draft.overridden) {
        draft.ref = pkgToken.ref ?? draft.ref ?? null;
        return;
      }
      draft.value = pkgToken.value;
      draft.ref = pkgToken.ref ?? null;
      draft.description = pkgToken.description || draft.description;
      draft.pendingReview = false;
    });
    next.tokens[kind] = draftTokens;
  });
  return next;
}
