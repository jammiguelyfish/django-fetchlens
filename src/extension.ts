import * as vscode from "vscode";
import { findProjectRoot, runHelper } from "./runner";
import { openRoute, RoutesProvider } from "./routesProvider";
import { CallDefinitionProvider, CallLensProvider, FrontendAnalyser, FRONTEND_LANGS } from "./frontend";
import { Route } from "./types";

const output = vscode.window.createOutputChannel("Django FetchLens");

async function pythonFor(folder: vscode.WorkspaceFolder): Promise<string> {
  const cfg = vscode.workspace.getConfiguration("fetchlens", folder.uri).get<string>("pythonPath");
  if (cfg) return cfg;
  try {
    const ext = vscode.extensions.getExtension("ms-python.python");
    if (ext) {
      const api = await ext.activate();
      const details = api?.settings?.getExecutionDetails?.(folder.uri);
      if (details?.execCommand?.[0]) return details.execCommand[0];
    }
  } catch (e) {
    output.appendLine(`Python extension lookup failed: ${e}`);
  }
  return process.platform === "win32" ? "python" : "python3";
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new RoutesProvider();
  const analyser = new FrontendAnalyser();
  const selector = FRONTEND_LANGS.map((language) => ({ language }));
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, new CallLensProvider(analyser)),
    vscode.languages.registerDefinitionProvider(selector, new CallDefinitionProvider(analyser))
  );
  context.subscriptions.push(vscode.window.registerTreeDataProvider("fetchlens.routes", provider), output);

  let running = false;
  // A refresh asked for while one is running (e.g. a save during the first load) is not dropped:
  // it runs once more afterwards, and every caller waits for the run that includes its change.
  let inflight: Promise<void> | undefined;
  let rerun = false;
  function refresh(): Promise<void> {
    if (inflight) {
      rerun = true;
      return inflight;
    }
    inflight = (async () => {
      do {
        rerun = false;
        await load();
      } while (rerun);
    })().finally(() => {
      inflight = undefined;
    });
    return inflight;
  }

  async function load() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;
    running = true;
    provider.setLoading();
    try {
      const cfg = vscode.workspace.getConfiguration("fetchlens", folder.uri);
      const root = findProjectRoot(folder.uri.fsPath, cfg.get<string>("projectRoot") ?? "");
      if (!root) {
        provider.set({ ok: false, error: "No manage.py found. Set fetchlens.projectRoot." });
        analyser.setRoutes([]);
        return;
      }
      const python = await pythonFor(folder);
      const result = await runHelper({
        python,
        root,
        settings: cfg.get<string>("settingsModule") ?? "",
        extensionPath: context.extensionPath,
        env: cfg.get<Record<string, string>>("env") ?? {},
      });
      output.appendLine(
        result.ok
          ? `Loaded ${result.routes.length} routes (Django ${result.django}, ${result.settings}) with ${python}`
          : `Failed: ${result.error}\n${result.detail ?? ""}`
      );
      provider.set(result);
      analyser.setRoutes(result.ok ? result.routes : []);
    } finally {
      running = false;
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("fetchlens.refresh", refresh),
    vscode.commands.registerCommand("fetchlens.openRoute", (r: Route) => openRoute(r)),
    vscode.commands.registerCommand("fetchlens.goToRoute", async () => {
      const routes = provider.routes;
      if (!routes.length) {
        vscode.window.showWarningMessage("No routes loaded yet. Open the Django Routes view to see why.");
        return;
      }
      const pick = await vscode.window.showQuickPick(
        routes.map((r) => ({
          label: r.pattern.startsWith("/") ? r.pattern : "/" + r.pattern,
          description: r.methods ? r.methods.join(" ") : "ANY",
          detail: r.view + (r.external ? "  (third-party)" : ""),
          r,
        })),
        { matchOnDescription: true, matchOnDetail: true, placeHolder: "Search routes by URL, method or view" }
      );
      if (pick) openRoute(pick.r);
    })
  );

  // Re-read routes shortly after a urls.py or views file is saved.
  let timer: NodeJS.Timeout | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((d) => {
      if (d.languageId !== "python" || !/(urls|views|viewsets|api|settings)[^/\\]*\.py$/.test(d.fileName)) return;
      clearTimeout(timer);
      timer = setTimeout(refresh, 800);
    })
  );

  const first = refresh();
  return {
    /** For tests: resolves once the first load finished. */
    loaded: () => first.then(() => provider.routes),
    /** For tests: what the finder concluded about each call in a document. */
    analyse: (doc: vscode.TextDocument) => analyser.analyse(doc).map((a) => ({ line: a.range.start.line, path: a.call.path, method: a.call.method, status: a.status.kind })),
  };
}

export function deactivate() {}
