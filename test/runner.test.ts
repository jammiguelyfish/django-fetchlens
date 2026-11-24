import { describe, expect, it } from "vitest";
import * as path from "path";
import { findProjectRoot, parseHelperOutput, runHelper } from "../src/runner";
import { groupOf, Route } from "../src/types";

const SAMPLE = path.join(__dirname, "fixtures", "sample");
const python = process.env.FETCHLENS_TEST_PYTHON || (process.platform === "win32" ? "python" : "python3");

const route = (over: Partial<Route>): Route => ({
  pattern: "api/x/", regex: "", name: null, view: "V", methods: null, handlers: null,
  file: null, line: null, isRegex: false, external: false, ...over,
});

describe("parseHelperOutput", () => {
  it("uses the last line so prints from project code do not break parsing", () => {
    const r = parseHelperOutput('hello from settings\n{"django":"5.2","settings":"a.b","routes":[]}\n');
    expect(r).toEqual({ ok: true, django: "5.2", settings: "a.b", routes: [] });
  });
  it("turns a helper error into a message with the traceback", () => {
    const r = parseHelperOutput('{"error":"ImproperlyConfigured: x","traceback":"tb"}');
    expect(r).toEqual({ ok: false, error: "ImproperlyConfigured: x", detail: "tb" });
  });
  it("handles empty and non-JSON output", () => {
    expect(parseHelperOutput("").ok).toBe(false);
    expect(parseHelperOutput("Traceback (most recent call last)").ok).toBe(false);
  });
});

describe("groupOf", () => {
  it("groups by first path segment", () => {
    expect(groupOf(route({ pattern: "api/documents/<int:pk>/" }))).toBe("/api/");
    expect(groupOf(route({ pattern: "healthz/" }))).toBe("/healthz/");
  });
  it("puts third-party routes in their own group", () => {
    expect(groupOf(route({ external: true }))).toMatch(/Third-party/);
  });
});

describe("findProjectRoot", () => {
  it("finds manage.py in the folder itself", () => {
    expect(findProjectRoot(SAMPLE, "")).toBe(SAMPLE);
  });
  it("finds manage.py one level down", () => {
    expect(findProjectRoot(path.join(__dirname, "fixtures"), "")).toBe(SAMPLE);
  });
  it("honours a configured folder and rejects a wrong one", () => {
    expect(findProjectRoot(path.join(__dirname, "fixtures"), "sample")).toBe(SAMPLE);
    expect(findProjectRoot(path.join(__dirname, "fixtures"), "nope")).toBeUndefined();
  });
});

describe("runHelper (needs Django and DRF in the Python used)", () => {
  it("reads the sample project's routes", async () => {
    const r = await runHelper({ python, root: SAMPLE, settings: "", extensionPath: path.join(__dirname, ".."), env: {} });
    if (!r.ok) throw new Error(r.error + "\n" + r.detail);
    const cart = r.routes.find((x) => x.pattern === "api/v1/cart/");
    expect(cart?.methods).toEqual(["GET", "POST"]);
  }, 60_000);

  it("reports an unreachable interpreter as an error, not an exception", async () => {
    const r = await runHelper({ python: "definitely-not-python", root: SAMPLE, settings: "", extensionPath: path.join(__dirname, ".."), env: {} });
    expect(r.ok).toBe(false);
  });
});
