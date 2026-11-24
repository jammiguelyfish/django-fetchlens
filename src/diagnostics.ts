import * as vscode from "vscode";
import { FRONTEND_LANGS, FrontendAnalyser } from "./frontend";
import { Problem, problemsFor } from "./problems";

const SOURCE = "Django FetchLens";

function severity(doc: vscode.TextDocument): vscode.DiagnosticSeverity | undefined {
  const v = vscode.workspace.getConfiguration("fetchlens", doc.uri).get<string>("diagnostics", "warning");
  switch (v) {
    case "error": return vscode.DiagnosticSeverity.Error;
    case "information": return vscode.DiagnosticSeverity.Information;
    case "off": return undefined;
    default: return vscode.DiagnosticSeverity.Warning;
  }
}

function problems(analyser: FrontendAnalyser, doc: vscode.TextDocument): Problem[] {
  return problemsFor(doc.getText(), analyser.analyse(doc));
}

export function registerDiagnostics(context: vscode.ExtensionContext, analyser: FrontendAnalyser) {
  const collection = vscode.languages.createDiagnosticCollection("fetchlens");
  context.subscriptions.push(collection);

  const isFrontend = (d: vscode.TextDocument) => FRONTEND_LANGS.includes(d.languageId) && d.uri.scheme === "file";

  function update(doc: vscode.TextDocument) {
    if (!isFrontend(doc)) return;
    const sev = severity(doc);
    if (sev === undefined || !analyser.hasRoutes) {
      collection.delete(doc.uri);
      return;
    }
    collection.set(
      doc.uri,
      problems(analyser, doc).map((p) => {
        const d = new vscode.Diagnostic(new vscode.Range(doc.positionAt(p.start), doc.positionAt(p.end)), p.message, sev);
        d.source = SOURCE;
        d.code = p.kind;
        return d;
      })
    );
  }

  const updateAll = () => vscode.workspace.textDocuments.forEach(update);

  let timer: NodeJS.Timeout | undefined;
  const later = (doc: vscode.TextDocument) => {
    clearTimeout(timer);
    timer = setTimeout(() => update(doc), 300);
  };

  context.subscriptions.push(
    analyser.onDidChange(updateAll),
    vscode.workspace.onDidOpenTextDocument(update),
    vscode.workspace.onDidChangeTextDocument((e) => later(e.document)),
    vscode.workspace.onDidCloseTextDocument((d) => collection.delete(d.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("fetchlens") && updateAll()),
    vscode.languages.registerCodeActionsProvider(
      FRONTEND_LANGS.map((language) => ({ language })),
      {
        provideCodeActions(doc, range) {
          const actions: vscode.CodeAction[] = [];
          for (const p of problems(analyser, doc)) {
            if (!p.fix) continue;
            const pr = new vscode.Range(doc.positionAt(p.start), doc.positionAt(p.end));
            if (!pr.intersection(range)) continue;
            const a = new vscode.CodeAction(p.fix.title, vscode.CodeActionKind.QuickFix);
            a.edit = new vscode.WorkspaceEdit();
            a.edit.insert(doc.uri, doc.positionAt(p.fix.offset), p.fix.insert);
            a.isPreferred = true;
            actions.push(a);
          }
          return actions;
        },
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );

  updateAll();
}
