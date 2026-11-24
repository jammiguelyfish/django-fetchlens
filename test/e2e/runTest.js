// Launches a real VS Code with the extension and runs suite/index.js inside it.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { runTests } = require("@vscode/test-electron");

(async () => {
  // Work on a copy so the test never writes settings into the repository.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "fetchlens-e2e-"));
  const sample = path.join(work, "sample");
  fs.cpSync(path.resolve(__dirname, "..", "fixtures", "sample"), sample, { recursive: true });
  try {
    await runTests({
      extensionDevelopmentPath: path.resolve(__dirname, "..", ".."),
      extensionTestsPath: path.resolve(__dirname, "suite", "index.js"),
      launchArgs: [
        sample,
        "--disable-extensions",
        "--disable-workspace-trust",
      ],
    });
  } catch (err) {
    console.error("e2e failed:", err);
    process.exitCode = 1;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
})();
