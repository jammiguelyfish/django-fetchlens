export interface Handler {
  name: string;
  file: string | null;
  line: number | null;
}

export interface Route {
  pattern: string;
  regex: string;
  name: string | null;
  view: string;
  methods: string[] | null; // null = any method
  handlers: Record<string, Handler> | null;
  file: string | null;
  line: number | null;
  isRegex: boolean;
  external: boolean;
}

export type RoutesResult =
  | { ok: true; django: string; settings: string; routes: Route[] }
  | { ok: false; error: string; detail?: string };

/** Group key for the sidebar: first path segment, e.g. "api/documents/<int:pk>/" -> "/api/". */
export function groupOf(route: Route): string {
  if (route.external) return "Third-party (admin, etc.)";
  const seg = route.pattern.replace(/^\^/, "").split("/")[0];
  return seg ? `/${seg}/` : "/";
}
