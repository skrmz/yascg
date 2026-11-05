export interface AbbreviationDefinition {
  readonly full: string;
  readonly short: string;
  readonly suffixes?: readonly string[];
  readonly forms?: readonly string[];
  /** Only replace this surface when it introduces a numeric quantity. */
  readonly quantityPrefix?: boolean;
  /** Compact this unit after a quantity prefix, as in "≤ 1h". */
  readonly timeUnit?: boolean;
}
