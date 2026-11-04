export interface AbbreviationDefinition {
  readonly full: string;
  readonly short: string;
  readonly suffixes?: readonly string[];
  readonly forms?: readonly string[];
}
