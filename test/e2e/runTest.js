// Launches a real VS Code with the extension and runs suite/index.js inside it.
const path = require("path");
const { runTests } = require("@vscode/test-electron");

(async () => {
  try {
    await runTests({
      extensionDevelopmentPath: path.resolve(__dirname, "..", ".."),
      extensionTestsPath: path.resolve(__dirname, "suite", "index.js"),
      launchArgs: [
        path.resolve(__dirname, "..", "fixtures", "sample"),
        "--disable-extensions",
        "--disable-workspace-trust",
      ],
    });
  } catch (err) {
    console.error("e2e failed:", err);
    process.exit(1);
  }
})();
