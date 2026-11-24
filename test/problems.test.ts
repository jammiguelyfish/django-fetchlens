import { describe, expect, it } from "vitest";
import { findCalls } from "../src/calls";
import { compile, matchCall } from "../src/match";
import { isIgnored, problemsFor, slashInsertOffset } from "../src/problems";
import { Route } from "../src/types";

const route = (pattern: string, regex: string, methods: string[] | null): Route => ({
  pattern, regex, name: null, view: "DocView", methods, handlers: null, file: "/v.py", line: 1, isRegex: false, external: false,
});
const compiled = compile([
  route("api/documents/", "^api/documents/\\Z", ["GET", "POST"]),
  route("api/documents/<int:pk>/", "^api/documents/(?P<pk>[0-9]+)/\\Z", ["DELETE"]),
]);

const check = (code: string) => {
  const items = findCalls(code, "a.ts").map((call) => ({ call, status: matchCall(call, compiled) }));
  return problemsFor(code, items);
};

describe("problemsFor", () => {
  it("reports nothing for correct calls", () => {
    expect(check('fetch("/api/documents/"); fetch(`/api/documents/${id}/`, { method: "DELETE" });')).toEqual([]);
  });
  it("unknown route", () => {
    const [p] = check('fetch("/api/nope/")');
    expect(p.kind).toBe("notFound");
    expect(p.message).toBe("No Django route matches GET /api/nope/.");
  });
  it("wrong method names the allowed ones", () => {
    const [p] = check('fetch("/api/documents/", { method: "DELETE" })');
    expect(p.kind).toBe("wrongMethod");
    expect(p.message).toContain("does not accept DELETE");
    expect(p.message).toContain("GET, POST");
  });
  it("dynamic parts are shown readably", () => {
    const [p] = check("fetch(`/api/documents/${id}/`)");
    expect(p.kind).toBe("wrongMethod");
    expect(p.message).toContain("/api/documents/{...}/");
  });
  it("missing slash offers a fix that inserts before the closing quote", () => {
    const code = 'fetch("/api/documents")';
    const [p] = check(code);
    expect(p.kind).toBe("noTrailingSlash");
    const f = p.fix!;
    expect(code.slice(0, f.offset) + f.insert + code.slice(f.offset)).toBe('fetch("/api/documents/")');
  });
  it("the fix goes before a query string", () => {
    const code = 'fetch("/api/documents?page=2")';
    const f = check(code)[0].fix!;
    expect(code.slice(0, f.offset) + "/" + code.slice(f.offset)).toBe('fetch("/api/documents/?page=2")');
  });
  it("the fix ignores ? inside a template expression", () => {
    const code = "fetch(`/api/documents${a ? 1 : 2}`)";
    expect(slashInsertOffset(code, 6, code.length - 1)).toBe(code.length - 2);
  });
  it("no automatic fix for concatenations", () => {
    const [p] = check('fetch("/api/documents" + suffix)');
    // the URL is partly dynamic, so it is not judged at all rather than fixed wrongly
    expect(p === undefined || p.fix === undefined).toBe(true);
  });
});

describe("fetchlens-ignore", () => {
  it("on the same line", () => {
    expect(check('fetch("/api/nope/") // fetchlens-ignore')).toEqual([]);
  });
  it("on the line above", () => {
    expect(check('// fetchlens-ignore\nfetch("/api/nope/")')).toEqual([]);
  });
  it("only covers its own call", () => {
    const code = '// fetchlens-ignore\nfetch("/api/a/");\nfetch("/api/b/");';
    expect(check(code)).toHaveLength(1);
    expect(isIgnored(code, code.indexOf('"/api/b/"'))).toBe(false);
  });
});
