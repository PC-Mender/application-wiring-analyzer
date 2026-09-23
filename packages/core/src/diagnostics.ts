import type { BackendRoute, FrontendRequest, SourceLocation } from "./model.js";

export type DiagnosticCode = "AWA001" | "AWA002" | "AWA003" | "AWA004";
export type DiagnosticSeverity = "error" | "warning";

export interface WiringDiagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  location: SourceLocation;
  frontend?: FrontendRequest;
  backend?: BackendRoute;
}

export interface WiringMatch {
  frontend: FrontendRequest;
  backend: BackendRoute;
}

export interface WiringAnalysis {
  matches: WiringMatch[];
  diagnostics: WiringDiagnostic[];
}
