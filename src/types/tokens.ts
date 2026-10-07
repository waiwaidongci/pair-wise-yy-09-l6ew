export type TokenKind = "color" | "fontSize" | "spacing" | "radius" | "shadow" | "motion";

export const TOKEN_KINDS: TokenKind[] = ["color", "fontSize", "spacing", "radius", "shadow", "motion"];

export interface DesignToken {
  id: string;
  name: string;
  /** 当前值；别名令牌在此缓存最近一次解析结果 */
  value: string;
  description: string;
  /** 别名指向的令牌路径（如 color.brand.primary），为空表示基础值 */
  ref?: string | null;
  /** 用户显式覆盖了别名解析值 */
  overridden?: boolean;
  /** 覆盖那一刻引用目标的解析值，用于检测基础值漂移 */
  overrideBaseValue?: string | null;
  /** 基础值更新后，该覆盖需要人工复核 */
  pendingReview?: boolean;
}

export interface Theme {
  id: string;
  name: string;
  tokens: Record<TokenKind, DesignToken[]>;
  /** 草稿基于的导入修订 */
  baseRevisionId?: string | null;
}

export type RevisionStatus = "pending" | "applied";

export interface ImportRevision {
  id: string;
  packageName: string;
  version: string;
  importedAt: string;
  /** 令牌包有效期，过期后阻止导出 */
  expiresAt: string | null;
  status: RevisionStatus;
  tokens: Record<TokenKind, DesignToken[]>;
  /** 同包历史版本，保证修订可续作 */
  history: { version: string; importedAt: string }[];
}

export interface TokenConflict {
  id: string;
  themeId: string;
  kind: TokenKind;
  tokenId: string;
  name: string;
  /** 合并后保留在令牌上的值 */
  currentValue: string;
  /** 另一侧的值（两边都留，等待人工取舍） */
  incomingValue: string;
  detectedAt: string;
}

export interface Snapshot {
  id: string;
  label: string;
  createdAt: string;
  theme: Theme;
  /** 发布时冻结的解析结果，历史发布始终按此导出 */
  resolved: Record<string, string>;
  revisionId?: string | null;
  /** 保存时修订仍待应用，则为待确认快照 */
  revisionStatus?: RevisionStatus | null;
}

export interface PersistedState {
  version: number;
  themes: Theme[];
  activeThemeId: string;
  snapshots: Snapshot[];
  revisions: ImportRevision[];
  conflicts: TokenConflict[];
}

export interface TokenDifference {
  path: string;
  before: string;
  after: string;
  kind: "changed" | "added" | "removed";
}
