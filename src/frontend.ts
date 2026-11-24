import * as path from "path";
import * as vscode from "vscode";
import { ApiCall, findCalls } from "./calls";
import { CompiledRoute, compile, matchCall, MatchStatus, targetOf } from "./match";
import { Route } from "./types";

export const FRONTEND_LANGS = ["typescript", "typescriptreact", "javascript", "javascriptreact"];

export interface Analysed {
  call: ApiCall;
  range: vscode.Range;
  status: MatchStatus;
}

/** Holds the compiled routes and analyses frontend documents against them. */
export class FrontendAnalyser {
  private compiled: CompiledRoute[] = [];
  private cache = new Map<string, { version: number; result: Analysed[] }>();
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  setRoutes(routes: Route[]) {
    this.compiled = compile(routes);
    this.cache.clear();
    this.emitter.fire();
  }

  get hasRoutes() {
    return this.compiled.length > 0;
  }

  analyse(doc: vscode.TextDocument): Analysed[] {
    if (!this.compiled.length) return [];
    const key = doc.uri.toString();
    const cached = this.cache.get(key);
    if (cached && cached.version === doc.version) return cached.result;
    const receivers = vscode.workspace.getConfiguration("fetchlens", doc.uri).get<string[]>("clientReceivers");
    const result = findCalls(doc.getText(), doc.fileName, receivers && receivers.length ? { receivers } : {}).map((call) => ({
      call,
      range: new vscode.Range(doc.positionAt(call.start), doc.positionAt(call.end)),
      status: matchCall(call, this.compiled),
    }));
    this.cache.set(key, { version: doc.version, result });
    return result;
  }
}

function locationOf(route: Route, method: string | null): vscode.Location | undefined {
  const t = targetOf(route, method);
  if (!t.file) return undefined;
  const pos = new vscode.Position(Math.max(0, (t.line ?? 1) - 1), 0);
  return new vscode.Location(vscode.Uri.file(t.file), pos);
}

function shortPath(file: string): string {
  const rel = vscode.workspace.asRelativePath(file, false);
  return rel === file ? path.basename(file) : rel;
}

export class CallLensProvider implements vscode.CodeLensProvider {
  readonly onDidChangeCodeLenses: vscode.Event<void>;
  constructor(private analyser: FrontendAnalyser) {
    this.onDidChangeCodeLenses = analyser.onDidChange;
  }

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const doneLines = new Set<number>();
    for (const a of this.analyser.analyse(doc)) {
      if (a.status.kind !== "ok") continue;
      const line = a.range.start.line;
      if (doneLines.has(line)) continue; // one label per line is enough
      doneLines.add(line);
      const t = targetOf(a.status.route, a.call.method);
      const where = t.file ? `  ${shortPath(t.file)}${t.line ? ":" + t.line : ""}` : "";
      lenses.push(
        new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
          title: `$(arrow-right) ${t.name}${where}`,
          tooltip: `${a.call.method ?? "ANY"} ${a.status.route.pattern}`,
          command: "fetchlens.openRoute",
          arguments: [a.status.route, a.call.method ?? undefined],
        })
      );
    }
    return lenses;
  }
}

export class CallDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private analyser: FrontendAnalyser) {}

  provideDefinition(doc: vscode.TextDocument, pos: vscode.Position): vscode.Location | undefined {
    for (const a of this.analyser.analyse(doc)) {
      if (a.range.contains(pos) && a.status.kind === "ok") return locationOf(a.status.route, a.call.method);
    }
    return undefined;
  }
}
