export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type HttpMethod = typeof HTTP_METHODS[number];

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface FrontendRequest {
  kind: "frontend-request";
  method: HttpMethod | null;
  rawUrl: string;
  normalizedPath: string | null;
  location: SourceLocation;
}

export interface BackendRoute {
  kind: "backend-route";
  method: HttpMethod;
  rawPath: string;
  normalizedPath: string | null;
  handler?: string;
  location: SourceLocation;
}

export interface ExtractionMetadata {
  filesScanned: number;
  itemsExtracted: number;
  skippedShadowedFetch: number;
  skippedByExclude: number;
  importResolutionFailures: number;
}

export type AnalysisStatus = "complete" | "partial" | "unsupported" | "failed";

export type ProjectSide = "frontend" | "backend" | "both";

export interface SideInfo {
  framework: string | null;
  extractorUsed: string;
  metadata: ExtractionMetadata;
  extractorNote?: string;
}

export interface ScannedFile {
  role: "frontend" | "backend";
  path: string;
}
