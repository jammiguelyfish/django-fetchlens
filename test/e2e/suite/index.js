const assert = require("assert");
const path = require("path");
const vscode = require("vscode");

exports.run = async function run() {
  const py = process.env.FETCHLENS_TEST_PYTHON;
  assert.ok(py, "set FETCHLENS_TEST_PYTHON to a Python that has Django and DRF");

  const ext = vscode.extensions.getExtension("jammiguelyfish.django-fetchlens");
  assert.ok(ext, "extension is installed in the test host");
  const api = await ext.activate();

  const cmds = await vscode.commands.getCommands(true);
  for (const c of ["fetchlens.refresh", "fetchlens.goToRoute", "fetchlens.openRoute"]) {
    assert.ok(cmds.includes(c), `command ${c} is registered`);
  }

  // Point it at the interpreter with Django, then reload.
  await vscode.workspace.getConfiguration("fetchlens").update("pythonPath", py, vscode.ConfigurationTarget.Workspace);
  await vscode.commands.executeCommand("fetchlens.refresh");
  const routes = await api.loaded();
  const cart = routes.find((r) => r.pattern === "api/v1/cart/");
  assert.ok(cart, "cart route loaded: " + routes.map((r) => r.pattern).join(", "));
  assert.deepStrictEqual(cart.methods, ["GET", "POST"]);

  // Opening a route must land on the view's source line.
  const detail = routes.find((r) => r.pattern === "api/v1/products/<pk>/");
  assert.ok(detail, "viewset detail route loaded");
  await vscode.commands.executeCommand("fetchlens.openRoute", detail);
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, "an editor opened");
  assert.strictEqual(path.basename(editor.document.fileName), "views.py");
  assert.strictEqual(editor.selection.active.line + 1, detail.line);
  assert.ok(editor.document.lineAt(editor.selection.active.line).text.includes("def retrieve"));

  // Frontend calls: labels above them and Ctrl+click to the view.
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(folder, "frontend", "api.ts")));
  await vscode.window.showTextDocument(doc);
  const found = api.analyse(doc);
  assert.deepStrictEqual(
    found.map((f) => `${f.line + 1} ${f.method} ${f.status}`),
    ["2 GET ok", "3 GET ok", "4 POST ok", "5 GET unchecked"],
    JSON.stringify(found)
  );

  const lenses = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", doc.uri);
  const titles = lenses.map((l) => l.command && l.command.title);
  assert.strictEqual(lenses.length, 3, JSON.stringify(titles));
  assert.ok(titles[0].includes("ProductViewSet.list"), titles[0]);
  assert.ok(titles[1].includes("ProductViewSet.retrieve"), titles[1]);
  assert.ok(titles[2].includes("checkout"), titles[2]);

  // Ctrl+click inside the URL string of line 3 lands on the retrieve action.
  const col = doc.lineAt(2).text.indexOf("/api/v1") + 3;
  const defs = await vscode.commands.executeCommand("vscode.executeDefinitionProvider", doc.uri, new vscode.Position(2, col));
  assert.strictEqual(defs.length, 1);
  const target = await vscode.workspace.openTextDocument(defs[0].uri);
  assert.ok(target.lineAt(defs[0].range.start.line).text.includes("def retrieve"));
  // Clicking on the external URL does nothing.
  const none = await vscode.commands.executeCommand("vscode.executeDefinitionProvider", doc.uri, new vscode.Position(4, 45));
  assert.strictEqual(none.length, 0);

  // Clean up the setting we wrote so the fixture folder stays untouched.
  await vscode.workspace.getConfiguration("fetchlens").update("pythonPath", undefined, vscode.ConfigurationTarget.Workspace);
};
