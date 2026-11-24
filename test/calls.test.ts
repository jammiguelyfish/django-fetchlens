import { describe, expect, it } from "vitest";
import { DYN, findCalls } from "../src/calls";

const one = (code: string, file = "a.ts") => {
  const r = findCalls(code, file);
  expect(r).toHaveLength(1);
  return r[0];
};

describe("fetch", () => {
  it("plain GET", () => {
    const c = one('fetch("/api/documents/")');
    expect(c).toMatchObject({ path: "/api/documents/", method: "GET", callee: "fetch" });
  });
  it("method from options", () => {
    expect(one('fetch("/api/x/", { method: "post", body })').method).toBe("POST");
  });
  it("method chosen at runtime is unknown, not guessed", () => {
    expect(one('fetch("/api/x/", { method })').method).toBeNull();
    expect(one('fetch("/api/x/", { ...opts })').method).toBeNull();
  });
  it("template literal with a dynamic part", () => {
    expect(one("fetch(`/api/documents/${id}/`)").path).toBe(`/api/documents/${DYN}/`);
  });
  it("concatenation", () => {
    expect(one('fetch("/api/documents/" + id + "/")').path).toBe(`/api/documents/${DYN}/`);
  });
  it("drops query string, hash and the origin", () => {
    expect(one('fetch("http://localhost:8000/api/x/?a=1#h")').path).toBe("/api/x/");
    expect(one("fetch(`/api/x/?q=${q}`)").path).toBe("/api/x/");
  });
  it("skips URLs it cannot read", () => {
    expect(findCalls("fetch(url)", "a.ts")).toEqual([]);
    expect(findCalls("fetch(`${base}/x/`)", "a.ts")).toEqual([]);
    expect(findCalls('fetch("https://example.com")', "a.ts")).toEqual([]); // no path
    expect(findCalls('fetch("//cdn.example.com/x")', "a.ts")).toEqual([]);
    expect(findCalls('fetch("relative/path")', "a.ts")).toEqual([]);
  });
});

describe("axios and friends", () => {
  it("method helpers", () => {
    expect(one('axios.post("/api/x/", data)')).toMatchObject({ method: "POST", path: "/api/x/" });
    expect(one('api.delete(`/api/x/${id}/`)')).toMatchObject({ method: "DELETE" });
  });
  it("config object", () => {
    expect(one('axios({ url: "/api/x/", method: "put" })')).toMatchObject({ method: "PUT", path: "/api/x/" });
    expect(one('axios.request({ url: "/api/x/" })').method).toBe("GET");
  });
  it("ignores .get on things that are not HTTP clients", () => {
    expect(findCalls('cache.get("/not/a/url")', "a.ts")).toEqual([]);
    expect(findCalls('map.get("/api/x/")', "a.ts")).toEqual([]);
  });
  it("custom receivers", () => {
    const r = findCalls('backend.get("/api/x/")', "a.ts", { receivers: ["backend"] });
    expect(r).toHaveLength(1);
  });
});

describe("wrapper functions with the method first (pdf-qna-bot style)", () => {
  it("request<T>('POST', path)", () => {
    expect(one('request<User>("POST", "/api/auth/login/", { username })')).toMatchObject({
      method: "POST", path: "/api/auth/login/", callee: "request",
    });
  });
  it("template literal path", () => {
    expect(one("request<void>('DELETE', `/api/documents/${id}/`)")).toMatchObject({ method: "DELETE", path: `/api/documents/${DYN}/` });
  });
  it("finds every call in a realistic file, once each", () => {
    const code = `
      export const realApi = {
        me: () => request<User>("GET", "/api/auth/me/"),
        deleteConversation: (id: number) => request<void>("DELETE", \`/api/conversations/\${id}/\`),
        ask: (q: string) => request<R>("POST", "/api/chat/", { q }),
      };
      async function ensureCsrf() { await fetch("/api/auth/csrf/", { credentials: "same-origin" }); }
    `;
    expect(findCalls(code, "api.ts").map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/auth/me/", `DELETE /api/conversations/${DYN}/`, "POST /api/chat/", "GET /api/auth/csrf/",
    ]);
  });
});

describe("offsets and file types", () => {
  it("start/end cover exactly the URL expression", () => {
    const code = 'const r = await fetch("/api/x/");';
    const c = one(code);
    expect(code.slice(c.start, c.end)).toBe('"/api/x/"');
  });
  it("parses TSX and JSX", () => {
    expect(one('const A = () => <button onClick={() => fetch("/api/x/")} />;', "a.tsx").path).toBe("/api/x/");
    expect(one('const A = () => <b onClick={() => fetch("/api/x/")} />;', "a.jsx").path).toBe("/api/x/");
  });
  it("does not throw on broken code", () => {
    expect(() => findCalls('fetch("/api/x/"', "a.ts")).not.toThrow();
    expect(() => findCalls("}}}{{{", "a.ts")).not.toThrow();
  });
});
