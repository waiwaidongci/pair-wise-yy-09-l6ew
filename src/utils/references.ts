import type { DesignToken, ExportIssue, Theme, TokenKind } from "../types/tokens";

export const TOKEN_KINDS: TokenKind[] = ["color", "fontSize", "spacing", "radius", "shadow", "motion"];

const REFERENCE_PATTERN = /^\{([^{}]+)\}$/;

/** 从 "{path.to.token}" 形式的值中取出被引用令牌名；非引用返回 null */
export function parseReference(value: string): string | null {
  const match = value.trim().match(REFERENCE_PATTERN);
  return match ? match[1].trim() : null;
}

export function isReference(value: string): boolean {
  return parseReference(value) !== null;
}

export function referenceOf(token: DesignToken): string | null {
  if (token.ref) return token.ref;
  return parseReference(token.value);
}

export function buildTokenIndex(theme: Theme): Map<string, DesignToken> {
  const index = new Map<string, DesignToken>();
  TOKEN_KINDS.forEach((kind) => {
    theme.tokens[kind].forEach((token) => index.set(token.name, token));
  });
  return index;
}

export interface Resolution {
  value: string;
  issue?: ExportIssue;
}

/**
 * 解析令牌的有效值：
 * 显式覆盖 > 引用解析（沿别名链找到基础值）> 字面量。
 * 引用成环或目标缺失时返回 issue，value 为空串。
 */
export function resolveToken(
  token: DesignToken,
  index: Map<string, DesignToken>,
  seen: Set<string> = new Set(),
): Resolution {
  if (token.override !== undefined) return { value: token.override };
  const ref = referenceOf(token);
  if (!ref) return { value: token.value };
  if (seen.has(token.name)) {
    return {
      value: "",
      issue: { type: "cycle", path: [...seen, token.name] },
    };
  }
  const target = index.get(ref);
  if (!target) {
    return {
      value: "",
      issue: { type: "missing", token: token.name, target: ref },
    };
  }
  return resolveToken(target, index, new Set(seen).add(token.name));
}

/** 令牌的展示值：冲突时取本地一侧，引用解析失败时回退为原始值 */
export function displayValue(token: DesignToken, index: Map<string, DesignToken>): string {
  if (token.conflict?.length) return token.conflict[0];
  const resolved = resolveToken(token, index);
  return resolved.value || token.value;
}

/** 参与多标签页合并的签名值：覆盖值 > 引用串 > 字面量 */
export function signatureOf(token: DesignToken): string {
  if (token.override !== undefined) return token.override;
  const ref = referenceOf(token);
  return ref ? `{${ref}}` : token.value;
}

export function kindFromName(name: string): TokenKind {
  const head = name.split(".")[0];
  if (head === "color") return "color";
  if (head === "font") return "fontSize";
  if (head === "space") return "spacing";
  if (head === "radius") return "radius";
  if (head === "shadow") return "shadow";
  if (head === "motion" || head === "time" || head === "duration") return "motion";
  return "color";
}

export function allTokens(theme: Theme): DesignToken[] {
  return TOKEN_KINDS.flatMap((kind) => theme.tokens[kind]);
}
