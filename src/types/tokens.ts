export type TokenKind = "color" | "fontSize" | "spacing" | "radius" | "shadow" | "motion";

export interface DesignToken {
  id: string;
  name: string;
  value: string;
  description: string;
  /** 引用的令牌名（别名），如 "color.brand.primary"；值本身仍以 "{name}" 形式存放在 value 中 */
  ref?: string;
  /** 显式覆盖值（字面量），优先于引用解析；恢复引用后清除 */
  override?: string;
  /** 基础值变更后，显式覆盖仍保留但需要人工复核 */
  needsReview?: boolean;
  /** 多标签页合并时两边都留下的值 */
  conflict?: string[];
  /** 最近一次令牌包同步时的值，作为多标签页三方合并的基线 */
  syncedValue?: string;
}

export interface Theme {
  id: string;
  name: string;
  tokens: Record<TokenKind, DesignToken[]>;
  /** 草稿来源的令牌包 */
  packageId?: string;
  /** 草稿已同步到的包版本 */
  packageVersion?: number;
  /** 最近一次同步时间 */
  syncedAt?: string;
}

export interface Snapshot {
  id: string;
  label: string;
  createdAt: string;
  theme: Theme;
}

/** 外部同步进来的令牌包：基础值、别名与引用目标的扁平集合 */
export interface TokenPackage {
  id: string;
  name: string;
  version: number;
  /** 令牌名 → 值（字面量或 "{引用}"） */
  tokens: Record<string, string>;
  importedAt: string;
}

export type ExportIssueType = "cycle" | "missing" | "stale" | "conflict";

export interface ExportIssue {
  type: ExportIssueType;
  /** 相关令牌名 */
  token?: string;
  /** 缺失的引用目标 */
  target?: string;
  /** 成环路径 */
  path?: string[];
  /** 冲突双方的值 */
  values?: string[];
  packageId?: string;
  current?: number;
  latest?: number;
}

export interface TokenDifference {
  path: string;
  before: string;
  after: string;
  kind: "changed" | "added" | "removed";
}
