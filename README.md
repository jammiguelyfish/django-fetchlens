# Django FetchLens

A VS Code extension that reads the URLs your Django project really serves, lists them in a sidebar, and jumps from a route to the view that handles it.

> **Status: work in progress (milestone 2 of 4).** Route browsing and frontend-to-view linking work. Warnings for missing routes, wrong methods and missing trailing slashes are next, then packaging and publishing.

## What works today

- **Routes sidebar** (activity bar, "Django Routes"): every route, grouped by first path segment, with its HTTP methods and view. Django admin and other third-party routes are collapsed into their own group.
- **Open the view**: click a route to land on the function, class-based view method, or DRF `ViewSet` action that serves it.
- **Go to route...**: a quick-pick search over URL, method and view name.
- **Accurate methods**: read from class-based views, DRF `@api_view`, DRF viewset action maps, and `@require_POST` / `@require_http_methods`.
- Refreshes a moment after you save a `urls.py`, `views.py` or settings file.

## Frontend calls to views

In `.ts`, `.tsx`, `.js` and `.jsx` files, FetchLens finds the requests your code sends and matches each one against the real routes, the way Django would (first matching route wins, `<int:pk>` and friends respected).

- A label above the line shows the view that handles it, e.g. `-> DocumentList.post  documents/views.py:45`.
- **Ctrl+click** the URL string to jump to that view (the method's own handler, so a `POST` lands on `post`, not on `get`).

It recognises:

| Shape | Example |
|---|---|
| `fetch` | `fetch("/api/documents/", { method: "POST" })` |
| axios and similar | `axios.post("/api/x/")`, `api.delete(\`/api/x/${id}/\`)`, `axios({ url, method })` |
| method-first wrappers | `request("POST", "/api/auth/login/")` (any function name, no setup) |

URLs it cannot read statically (a variable, `${base}/x`) are skipped rather than guessed. Calls to URLs the project does not serve, such as other websites or `/static/`, are never judged.

## How it works

FetchLens runs a small helper (`python/fetchlens_routes.py`) with your project's own Python interpreter. The helper calls `django.setup()` and walks the URL resolver that Django itself builds, so `include()`, namespaces and DRF routers behave exactly as they do at runtime. There is no regex guessing of `urls.py`.

Because that executes your project's code, the extension is disabled in untrusted workspaces.

## Settings

| Setting | Purpose |
|---|---|
| `fetchlens.pythonPath` | Interpreter with your dependencies. Empty uses the one selected in the Python extension. |
| `fetchlens.projectRoot` | Folder containing `manage.py`. Empty auto-detects. |
| `fetchlens.settingsModule` | `DJANGO_SETTINGS_MODULE`. Empty reads it from `manage.py`. |
| `fetchlens.env` | Environment variables to set while loading Django, e.g. `{"DJANGO_DEBUG": "1"}` for settings that refuse to load without them. |

## Development

```bash
npm install
npm run compile
npm test             # unit tests (needs Django + DRF in the Python it uses)
npm run test:py      # tests for the Python helper
npm run test:e2e     # launches a real VS Code against test/fixtures/sample
```

Set `FETCHLENS_TEST_PYTHON` to an interpreter that has `Django` and `djangorestframework` installed.

If `npm run test:e2e` fails with "Cannot find module" on Windows, your shell has `ELECTRON_RUN_AS_NODE` set (VS Code terminals do); unset it first.

## License

MIT
