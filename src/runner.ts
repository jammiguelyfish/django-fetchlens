import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { RoutesResult } from "./types";

export interface RunOptions {
  python: string;
  root: string;
  settings: string;
  extensionPath: string;
  env: Record<string, string>;
  timeoutMs?: number;
}

/** Find the folder that contains manage.py, looking in the workspace folder then one level down. */
export function findProjectRoot(workspace: string, configured: string): string | undefined {
  if (configured) {
    const p = path.resolve(workspace, configured);
    return fs.existsSync(path.join(p, "manage.py")) ? p : undefined;
  }
  if (fs.existsSync(path.join(workspace, "manage.py"))) return workspace;
  const skip = new Set(["node_modules", "venv", ".venv", "env", ".git"]);
  for (const entry of fs.readdirSync(workspace, { withFileTypes: true })) {
    if (entry.isDirectory() && !skip.has(entry.name) && fs.existsSync(path.join(workspace, entry.name, "manage.py"))) {
      return path.join(workspace, entry.name);
    }
  }
  return undefined;
}

export function parseHelperOutput(stdout: string): RoutesResult {
  const text = stdout.trim();
  if (!text) return { ok: false, error: "The helper printed nothing." };
  try {
    // Project code may print during import; the helper's JSON is the last line.
    const last = text.split(/\r?\n/).filter(Boolean).pop()!;
    const j = JSON.parse(last);
    if (j.error) return { ok: false, error: j.error, detail: j.traceback };
    return { ok: true, django: j.django, settings: j.settings, routes: j.routes };
  } catch {
    return { ok: false, error: "The helper returned output that is not JSON.", detail: text.slice(0, 2000) };
  }
}

export function runHelper(o: RunOptions): Promise<RoutesResult> {
  const script = path.join(o.extensionPath, "python", "fetchlens_routes.py");
  const args = [script, "--root", o.root];
  if (o.settings) args.push("--settings", o.settings);
  return new Promise((resolve) => {
    execFile(
      o.python,
      args,
      { cwd: o.root, env: { ...process.env, ...o.env, PYTHONIOENCODING: "utf-8" }, timeout: o.timeoutMs ?? 60_000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (!stdout.trim()) {
          const why = err ? err.message : "The helper printed nothing.";
          return resolve({ ok: false, error: `Could not run ${o.python}: ${why}`, detail: stderr });
        }
        resolve(parseHelperOutput(stdout));
      }
    );
  });
}
