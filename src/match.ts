import { DYN, ApiCall } from "./calls";
import { Route } from "./types";

export type MatchStatus =
  | { kind: "ok"; route: Route }
  | { kind: "noTrailingSlash"; route: Route; suggestion: string }
  | { kind: "wrongMethod"; route: Route; allowed: string[] }
  | { kind: "notFound" }
  | { kind: "unchecked" }; // not a URL this project serves (external API, static file, ...)

/** Python (?P<name>...) and \Z to their JavaScript spellings. */
export function toJsRegex(pythonRegex: string): RegExp | undefined {
  const src = pythonRegex
    .replace(/\(\?P<(\w+)>/g, "(?<$1>")
    .replace(/\(\?P=(\w+)\)/g, "\\k<$1>")
    .replace(/\\Z/g, "$")
    .replace(/\\A/g, "^");
  try {
    return new RegExp(src);
  } catch {
    return undefined; // an exotic pattern JavaScript cannot express; the route is skipped
  }
}

// Values a dynamic `${...}` might hold, tried in turn so <int:pk>, <slug:s>, <uuid:u> and <str:x> all match.
const SAMPLES = ["1", "a-b", "00000000-0000-0000-0000-000000000000"];

function pathCandidates(path: string): string[] {
  if (!path.includes(DYN)) return [path];
  return SAMPLES.map((s) => path.split(DYN).join(s));
}

export interface CompiledRoute {
  route: Route;
  re: RegExp;
}

export function compile(routes: Route[]): CompiledRoute[] {
  const out: CompiledRoute[] = [];
  for (const route of routes) {
    const re = toJsRegex(route.regex);
    if (re) out.push({ route, re });
  }
  return out;
}

const IMPLICIT = new Set(["HEAD", "OPTIONS"]);

function firstSegment(p: string): string {
  return p.replace(/^\^?\/?/, "").split("/")[0];
}

/**
 * Match a frontend call against the project's routes the way Django would:
 * the first route (in URL-conf order) whose pattern fits wins.
 */
export function matchCall(call: ApiCall, compiled: CompiledRoute[]): MatchStatus {
  const withoutLead = (p: string) => p.replace(/^\//, "");
  const find = (path: string): CompiledRoute | undefined => {
    for (const cand of pathCandidates(withoutLead(path))) {
      const hit = compiled.find((c) => c.re.test(cand));
      if (hit) return hit;
    }
    return undefined;
  };

  // Only judge URLs under a prefix the project owns (e.g. /api/); other URLs are not ours to check.
  const owned = new Set(compiled.filter((c) => !c.route.external).map((c) => firstSegment(c.route.pattern)));
  const seg = firstSegment(call.path);
  if (!owned.has(seg) && !compiled.some((c) => c.re.test(withoutLead(call.path).replace(new RegExp(DYN, "g"), "1")))) {
    return { kind: "unchecked" };
  }

  const hit = find(call.path);
  if (hit) {
    const allowed = hit.route.methods;
    if (call.method && allowed && !allowed.includes(call.method) && !IMPLICIT.has(call.method)) {
      return { kind: "wrongMethod", route: hit.route, allowed };
    }
    return { kind: "ok", route: hit.route };
  }

  if (!call.path.endsWith("/")) {
    const fixed = find(call.path + "/");
    if (fixed) return { kind: "noTrailingSlash", route: fixed.route, suggestion: call.path + "/" };
  }
  return { kind: "notFound" };
}

/** The handler to jump to for a call: the method's own handler when known, else the route's view. */
export function targetOf(route: Route, method: string | null): { file: string | null; line: number | null; name: string } {
  const h = method ? route.handlers?.[method] : undefined;
  return { file: h?.file ?? route.file, line: h?.line ?? route.line, name: h?.name ?? route.view };
}
