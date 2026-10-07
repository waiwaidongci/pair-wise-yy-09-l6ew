import type { DesignToken, Snapshot, Theme, TokenDifference, TokenKind } from "../types/tokens";
import { TOKEN_KINDS } from "../types/tokens";
import { resolvedValues } from "./refs";

export const TOKEN_LABELS: Record<TokenKind, string> = {
  color: "颜色",
  fontSize: "字号",
  spacing: "间距",
  radius: "圆角",
  shadow: "阴影",
  motion: "动效时长",
};

export function flattenTheme(theme: Theme): Record<string, string> {
  const result: Record<string, string> = {};
  TOKEN_KINDS.forEach((kind) => {
    theme.tokens[kind].forEach((token) => {
      result[token.name] = token.value;
    });
  });
  return result;
}

const cssVarName = (name: string): string => name.replace(/\./g, "-").replace(/[^a-zA-Z0-9-_]/g, "-");

function flatToCssVariables(flat: Record<string, string>): string {
  const lines = Object.entries(flat).map(([name, value]) => `  --${cssVarName(name)}: ${value};`);
  return `:root {\n${lines.join("\n")}\n}\n`;
}

function flatToSassVariables(flat: Record<string, string>): string {
  const lines = Object.entries(flat).map(([name, value]) => `$${cssVarName(name)}: ${value};`);
  return `${lines.join("\n")}\n`;
}

export function toCssVariables(theme: Theme): string {
  return flatToCssVariables(resolvedValues(theme));
}

export function toSassVariables(theme: Theme): string {
  return flatToSassVariables(resolvedValues(theme));
}

export function toStyleDictionaryJson(theme: Theme): string {
  const resolved = resolvedValues(theme);
  const tree: Record<string, unknown> = {};
  TOKEN_KINDS.forEach((kind) => {
    theme.tokens[kind].forEach((token) => {
      const path = token.name.split(".");
      let branch = tree;
      path.forEach((segment, index) => {
        if (index === path.length - 1) {
          branch[segment] = {
            value: resolved[token.name] ?? token.value,
            type: kind === "motion" ? "time" : kind === "fontSize" ? "dimension" : kind,
            comment: token.description,
          };
          return;
        }
        branch[segment] = branch[segment] ?? {};
        branch = branch[segment] as Record<string, unknown>;
      });
    });
  });
  return `${JSON.stringify(tree, null, 2)}\n`;
}

/** 历史发布按原快照导出：使用保存时冻结的解析结果，不受后续编辑影响 */
export function snapshotToCssVariables(snapshot: Snapshot): string {
  return flatToCssVariables(snapshot.resolved);
}

export function snapshotToSassVariables(snapshot: Snapshot): string {
  return flatToSassVariables(snapshot.resolved);
}

export function snapshotToStyleDictionary(snapshot: Snapshot): string {
  return toStyleDictionaryJson(snapshot.theme);
}

export function downloadText(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function diffThemes(before: Theme, after: Theme): TokenDifference[] {
  const left = flattenTheme(before);
  const right = flattenTheme(after);
  const names = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
  return names.reduce<TokenDifference[]>((differences, path) => {
    if (!(path in left)) {
      differences.push({ path, before: "未定义", after: right[path], kind: "added" });
      return differences;
    }
    if (!(path in right)) {
      differences.push({ path, before: left[path], after: "已移除", kind: "removed" });
      return differences;
    }
    if (left[path] !== right[path]) {
      differences.push({ path, before: left[path], after: right[path], kind: "changed" });
    }
    return differences;
  }, []);
}

export function tokenToCss(token: DesignToken): string {
  if (token.name.includes("font")) return `font-size:${token.value}`;
  if (token.name.includes("radius")) return `border-radius:${token.value}`;
  if (token.name.includes("shadow")) return `box-shadow:${token.value}`;
  return token.value;
}
