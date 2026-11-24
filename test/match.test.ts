import { describe, expect, it } from "vitest";
import { DYN, ApiCall } from "../src/calls";
import { compile, matchCall, targetOf, toJsRegex } from "../src/match";
import { Route } from "../src/types";

const route = (pattern: string, regex: string, methods: string[] | null, over: Partial<Route> = {}): Route => ({
  pattern, regex, name: null, view: "V", methods, handlers: null, file: "/p/views.py", line: 10, isRegex: false, external: false, ...over,
});

const routes = compile([
  route("healthz/", "^healthz/\\Z", null),
  route("api/documents/", "^api/documents/\\Z", ["GET", "POST"]),
  route("api/documents/<int:pk>/", "^api/documents/(?P<pk>[0-9]+)/\\Z", ["DELETE", "GET"]),
  route("api/items/<uuid:id>/", "^api/items/(?P<id>[0-9a-f-]{36})/\\Z", ["GET"]),
  route("api/v1/products/<pk>/", "^api/v1/products/(?P<pk>[^/.]+)/$", ["GET"]),
  route("admin/", "^admin/\\Z", null, { external: true }),
]);

const call = (path: string, method: string | null = "GET"): ApiCall => ({ start: 0, end: 1, path, method, callee: "fetch" });

describe("toJsRegex", () => {
  it("converts named groups and \\Z", () => {
    expect(toJsRegex("^a/(?P<pk>[0-9]+)/\\Z")!.test("a/5/")).toBe(true);
  });
  it("returns undefined for patterns JavaScript cannot parse", () => {
    expect(toJsRegex("^a/(?i)b/\\Z")).toBeUndefined();
  });
});

describe("matchCall", () => {
  it("matches an exact route", () => {
    const s = matchCall(call("/api/documents/"), routes);
    expect(s.kind).toBe("ok");
  });
  it("matches dynamic parts for int, uuid and generic converters", () => {
    expect(matchCall(call(`/api/documents/${DYN}/`), routes).kind).toBe("ok");
    expect(matchCall(call(`/api/items/${DYN}/`), routes).kind).toBe("ok");
    expect(matchCall(call(`/api/v1/products/${DYN}/`), routes).kind).toBe("ok");
  });
  it("rejects a literal that does not fit the converter", () => {
    expect(matchCall(call("/api/documents/abc/"), routes).kind).toBe("notFound");
  });
  it("flags a method the view does not accept", () => {
    const s = matchCall(call("/api/documents/", "DELETE"), routes);
    expect(s).toMatchObject({ kind: "wrongMethod", allowed: ["GET", "POST"] });
  });
  it("treats HEAD and OPTIONS as always allowed, and unknown methods as unchecked", () => {
    expect(matchCall(call("/api/documents/", "OPTIONS"), routes).kind).toBe("ok");
    expect(matchCall(call("/api/documents/", null), routes).kind).toBe("ok");
  });
  it("routes with no method restriction accept anything", () => {
    expect(matchCall(call("/healthz/", "POST"), routes).kind).toBe("ok");
  });
  it("suggests the trailing slash Django needs", () => {
    expect(matchCall(call("/api/documents"), routes)).toMatchObject({ kind: "noTrailingSlash", suggestion: "/api/documents/" });
    expect(matchCall(call(`/api/documents/${DYN}`), routes)).toMatchObject({ kind: "noTrailingSlash" });
  });
  it("reports a missing route under a prefix the project owns", () => {
    expect(matchCall(call("/api/nothing/"), routes).kind).toBe("notFound");
  });
  it("does not judge URLs the project does not serve", () => {
    expect(matchCall(call("/static/logo.png"), routes).kind).toBe("unchecked");
    expect(matchCall(call("/some/other/api/"), routes).kind).toBe("unchecked");
  });
  it("third-party prefixes do not make a prefix 'owned'", () => {
    expect(matchCall(call("/admin/nothing/"), routes).kind).toBe("unchecked");
  });
});

describe("targetOf", () => {
  it("prefers the method's own handler", () => {
    const r = route("x/", "^x/$", ["GET", "POST"], {
      handlers: { GET: { name: "V.list", file: "/p/v.py", line: 3 }, POST: { name: "V.create", file: "/p/v.py", line: 9 } },
    });
    expect(targetOf(r, "POST")).toEqual({ file: "/p/v.py", line: 9, name: "V.create" });
    expect(targetOf(r, null)).toEqual({ file: "/p/views.py", line: 10, name: "V" });
  });
});
