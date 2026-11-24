import * as ts from "typescript";

/** A call in frontend code that sends a request to a URL we can read statically. */
export interface ApiCall {
  /** Offsets of the URL expression in the file (what Ctrl+click and the label attach to). */
  start: number;
  end: number;
  /** URL path with dynamic parts replaced by DYN, query/hash removed. Always starts with "/". */
  path: string;
  /** Upper-case HTTP method, or null when it is chosen at runtime. */
  method: string | null;
  /** Source text of the callee, e.g. "fetch", "axios.post", "request". */
  callee: string;
}

/** Marks a part of a URL that is computed at runtime, such as `${id}`. */
export const DYN = "\u0000";

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
const DEFAULT_RECEIVERS = ["axios", "api", "http", "client", "apiClient", "$http", "ky", "got", "instance"];

export interface FindOptions {
  /** Objects whose .get/.post/... calls are treated as HTTP calls. */
  receivers?: string[];
}

function scriptKind(fileName: string): ts.ScriptKind {
  if (/\.tsx$/i.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.(js|mjs|cjs)$/i.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** Turn a string-ish expression into text parts; anything computed becomes DYN. */
function flatten(e: ts.Expression): string[] {
  if (ts.isStringLiteralLike(e)) return [e.text];
  if (ts.isTemplateExpression(e)) {
    const out = [e.head.text];
    for (const span of e.templateSpans) out.push(DYN, span.literal.text);
    return out;
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...flatten(e.left), ...flatten(e.right)];
  }
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) return flatten(e.expression);
  return [DYN];
}

/** "http://localhost:8000/api/x/?a=1" -> "/api/x/"; returns undefined if it is not a path we can use. */
export function toPath(parts: string[]): string | undefined {
  let s = parts.join("").replace(new RegExp(`${DYN}+`, "g"), DYN);
  s = s.replace(/^https?:\/\/[^/?#]*/i, "");
  s = s.replace(/[?#].*$/s, "");
  if (!s.startsWith("/") || s.startsWith("//")) return undefined;
  return s;
}

function literalString(e: ts.Expression | undefined): string | undefined {
  return e && ts.isStringLiteralLike(e) ? e.text : undefined;
}

function prop(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name) {
      return p.initializer;
    }
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === name) return p.name;
  }
  return undefined;
}

const hasSpread = (obj: ts.ObjectLiteralExpression) => obj.properties.some(ts.isSpreadAssignment);

/** Method from an options object: absent -> GET, literal -> that, anything else -> unknown. */
function methodFromOptions(opts: ts.Expression | undefined): string | null {
  if (!opts) return "GET";
  if (!ts.isObjectLiteralExpression(opts)) return null;
  const m = prop(opts, "method");
  if (!m) return hasSpread(opts) ? null : "GET";
  const lit = literalString(m);
  return lit ? lit.toUpperCase() : null;
}

export function findCalls(text: string, fileName: string, options: FindOptions = {}): ApiCall[] {
  const receivers = new Set(options.receivers ?? DEFAULT_RECEIVERS);
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const found: ApiCall[] = [];

  const add = (urlExpr: ts.Expression, method: string | null, callee: string) => {
    const path = toPath(flatten(urlExpr));
    if (!path) return;
    found.push({ start: urlExpr.getStart(sf), end: urlExpr.getEnd(), path, method, callee });
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const args = node.arguments;
      const callee = node.expression.getText(sf);

      if (callee === "fetch" || callee === "window.fetch" || callee === "globalThis.fetch") {
        if (args[0]) add(args[0], methodFromOptions(args[1]), callee);
      } else if (ts.isPropertyAccessExpression(node.expression) && METHODS.includes(node.expression.name.text)) {
        // axios.post("/x"), api.get("/x"), http.delete("/x")
        const recv = node.expression.expression.getText(sf).split(".").pop()!;
        if (receivers.has(recv) && args[0]) add(args[0], node.expression.name.text.toUpperCase(), callee);
      } else if (callee === "axios" || callee === "axios.request" || callee === "$.ajax" || callee === "ky") {
        const a0 = args[0];
        if (a0 && ts.isObjectLiteralExpression(a0)) {
          const url = prop(a0, "url");
          if (url) add(url, methodFromOptions(a0), callee);
        } else if (a0) {
          add(a0, methodFromOptions(args[1]), callee);
        }
      }

      // request("POST", "/api/x/") style wrappers: method string first, then a path.
      if (args.length >= 2) {
        const m = literalString(args[0]);
        if (m && METHODS.includes(m.toLowerCase())) {
          const before = found.length;
          add(args[1], m.toUpperCase(), callee);
          // fetch("GET", ...) etc. would already have been handled above; avoid double entries.
          if (found.length - before > 1) found.length = before + 1;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // The same URL expression can be reached by two rules (e.g. receiver + method-first); keep one.
  const seen = new Set<string>();
  return found.filter((c) => {
    const k = `${c.start}:${c.end}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
