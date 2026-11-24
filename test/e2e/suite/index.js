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

  // Clean up the setting we wrote so the fixture folder stays untouched.
  await vscode.workspace.getConfiguration("fetchlens").update("pythonPath", undefined, vscode.ConfigurationTarget.Workspace);
};
