# Django FetchLens

A VS Code extension that reads the URLs your Django project really serves, lists them in a sidebar, and jumps from a route to the view that handles it.

> **Status: work in progress (milestone 1 of 4).** Route browsing works. Linking frontend `fetch()` calls to views and warning about missing routes are next.

## What works today

- **Routes sidebar** (activity bar, "Django Routes"): every route, grouped by first path segment, with its HTTP methods and view. Django admin and other third-party routes are collapsed into their own group.
- **Open the view**: click a route to land on the function, class-based view method, or DRF `ViewSet` action that serves it.
- **Go to route...**: a quick-pick search over URL, method and view name.
- **Accurate methods**: read from class-based views, DRF `@api_view`, DRF viewset action maps, and `@require_POST` / `@require_http_methods`.
- Refreshes a moment after you save a `urls.py`, `views.py` or settings file.

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
