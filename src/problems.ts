import { ApiCall, DYN } from "./calls";
import { MatchStatus } from "./match";

export type ProblemKind = "notFound" | "wrongMethod" | "noTrailingSlash";

export interface Problem {
  start: number;
  end: number;
  kind: ProblemKind;
  message: string;
  /** A text insertion that fixes it, when one is safe. */
  fix?: { offset: number; insert: string; title: string };
}

export const IGNORE_MARKER = "fetchlens-ignore";

const show = (path: string) => path.split(DYN).join("{...}");

/** True if the call's line, or the line above it, contains the ignore marker. */
export function isIgnored(text: string, start: number): boolean {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", start);
  const here = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  if (here.includes(IGNORE_MARKER)) return true;
  if (lineStart === 0) return false;
  const prevStart = text.lastIndexOf("\n", lineStart - 2) + 1;
  return text.slice(prevStart, lineStart - 1).includes(IGNORE_MARKER);
}

/**
 * Where a "/" can be inserted to add the trailing slash: the end of the path inside a
 * string or template literal, before any "?query" or "#hash". Undefined for anything else.
 */
export function slashInsertOffset(text: string, start: number, end: number): number | undefined {
  const lit = text.slice(start, end);
  const q = lit[0];
  if (lit.length < 2 || !(q === '"' || q === "'" || q === "`") || lit[lit.length - 1] !== q) return undefined;
  let depth = 0;
  for (let i = 1; i < lit.length - 1; i++) {
    const c = lit[i];
    if (q === "`" && c === "$" && lit[i + 1] === "{") {
      depth++;
      i++;
    } else if (depth > 0 && c === "}") {
      depth--;
    } else if (depth === 0 && (c === "?" || c === "#")) {
      return start + i;
    }
  }
  return end - 1;
}

export function problemsFor(text: string, items: { call: ApiCall; status: MatchStatus }[]): Problem[] {
  const out: Problem[] = [];
  for (const { call, status } of items) {
    if (status.kind === "ok" || status.kind === "unchecked") continue;
    if (isIgnored(text, call.start)) continue;
    const base = { start: call.start, end: call.end };
    const path = show(call.path);

    if (status.kind === "notFound") {
      out.push({ ...base, kind: "notFound", message: `No Django route matches ${call.method ? call.method + " " : ""}${path}.` });
    } else if (status.kind === "wrongMethod") {
      out.push({
        ...base,
        kind: "wrongMethod",
        message: `${path} does not accept ${call.method}. ${status.route.view} allows ${status.allowed.join(", ")}.`,
      });
    } else {
      const at = slashInsertOffset(text, call.start, call.end);
      out.push({
        ...base,
        kind: "noTrailingSlash",
        message: `Missing trailing slash: Django serves ${show(status.suggestion)}. GET is redirected, but POST, PUT, PATCH and DELETE fail.`,
        fix: at === undefined ? undefined : { offset: at, insert: "/", title: "Add the trailing slash" },
      });
    }
  }
  return out;
}
