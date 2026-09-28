export type Finding = { severity: "info" | "warning" | "problem"; module: string; message: string; evidence: string };
export type DiagnosticResult = { findings: Finding[]; engine_version: string };
