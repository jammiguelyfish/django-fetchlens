import * as vscode from "vscode";
import { groupOf, Route, RoutesResult } from "./types";

type Node =
  | { kind: "message"; text: string; detail?: string }
  | { kind: "group"; name: string; routes: Route[] }
  | { kind: "route"; route: Route };

export function openRoute(route: Route, method?: string): Thenable<unknown> | undefined {
  const h = method ? route.handlers?.[method] : undefined;
  const file = h?.file || route.file;
  const line = h?.line || route.line;
  if (!file) {
    vscode.window.showInformationMessage(`No source location for ${route.view}.`);
    return undefined;
  }
  const pos = new vscode.Position(Math.max(0, (line ?? 1) - 1), 0);
  return vscode.window.showTextDocument(vscode.Uri.file(file), { selection: new vscode.Range(pos, pos) });
}

export class RoutesProvider implements vscode.TreeDataProvider<Node> {
  private result: RoutesResult | undefined;
  private loading = true;
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  set(result: RoutesResult) {
    this.result = result;
    this.loading = false;
    this.emitter.fire();
  }
  setLoading() {
    this.loading = true;
    this.emitter.fire();
  }
  get routes(): Route[] {
    return this.result && this.result.ok ? this.result.routes : [];
  }

  getTreeItem(n: Node): vscode.TreeItem {
    if (n.kind === "message") {
      const item = new vscode.TreeItem(n.text);
      item.tooltip = n.detail;
      item.iconPath = new vscode.ThemeIcon(this.loading ? "sync~spin" : "warning");
      return item;
    }
    if (n.kind === "group") {
      const external = n.name.startsWith("Third-party");
      const item = new vscode.TreeItem(
        n.name,
        external ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded
      );
      item.description = String(n.routes.length);
      item.iconPath = new vscode.ThemeIcon("folder");
      return item;
    }
    const r = n.route;
    const item = new vscode.TreeItem(r.pattern.startsWith("/") ? r.pattern : "/" + r.pattern);
    item.description = `${r.methods ? r.methods.join(" ") : "ANY"}  ${r.view}`;
    item.tooltip = new vscode.MarkdownString(
      `**${r.pattern}**\n\nView: \`${r.view}\`${r.name ? `\n\nName: \`${r.name}\`` : ""}\n\nMethods: ${r.methods ? r.methods.join(", ") : "not restricted"}`
    );
    item.iconPath = new vscode.ThemeIcon("symbol-method");
    item.command = { command: "fetchlens.openRoute", title: "Open view", arguments: [r] };
    return item;
  }

  getChildren(n?: Node): Node[] {
    if (!n) {
      if (this.loading) return [{ kind: "message", text: "Reading routes from Django..." }];
      if (!this.result) return [];
      if (!this.result.ok) return [{ kind: "message", text: this.result.error, detail: this.result.detail }];
      const groups = new Map<string, Route[]>();
      for (const r of this.result.routes) {
        const g = groupOf(r);
        groups.set(g, [...(groups.get(g) ?? []), r]);
      }
      return [...groups.entries()]
        .sort(([a], [b]) => (a.startsWith("Third") ? 1 : b.startsWith("Third") ? -1 : a.localeCompare(b)))
        .map(([name, routes]) => ({ kind: "group" as const, name, routes }));
    }
    if (n.kind === "group") return n.routes.map((route) => ({ kind: "route" as const, route }));
    return [];
  }
}
