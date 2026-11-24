# Django FetchLens

A VS Code extension that reads the URLs your Django project really serves, lists them in a sidebar, and jumps from a route to the view that handles it.

> **Status: 0.1.0.** Everything below works and is tested. See [Limits](#limits) for what it does not do yet.

## Features

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
| axios and similar | `axios.post("/api/x/")`, ``api.delete(`/api/x/${id}/`)``, `axios({ url, method })` |
| method-first wrappers | `request("POST", "/api/auth/login/")` (any function name, no setup) |

URLs it cannot read statically (a variable, `${base}/x`) are skipped rather than guessed. Calls to URLs the project does not serve, such as other websites or `/static/`, are never judged.

## Warnings

Frontend calls that cannot work are underlined, so you find out in the editor instead of from a 404:

| Problem | Example message |
|---|---|
| Route does not exist | `No Django route matches GET /api/nope/.` |
| Method not allowed | `/api/v1/checkout/ does not accept GET. checkout allows POST.` |
| Missing trailing slash | `Missing trailing slash: Django serves /api/v1/cart/. GET is redirected, but POST, PUT, PATCH and DELETE fail.` (with a quick fix) |

Only URLs under a prefix your project owns (for example `/api/`) are checked, so calls to other sites and `/static/` never warn. Silence an intentional exception with `// fetchlens-ignore` on the same line or the line above, or change the level with `fetchlens.diagnostics` (`off`, `information`, `warning`, `error`).

## How it works

FetchLens runs a small helper (`python/fetchlens_routes.py`) with your project's own Python interpreter. The helper calls `django.setup()` and walks the URL resolver that Django itself builds, so `include()`, namespaces and DRF routers behave exactly as they do at runtime. There is no regex guessing of `urls.py`.

Because that executes your project's code, the extension is disabled in untrusted workspaces.

## Install

Search for **Django FetchLens** in the VS Code Extensions view, or install from the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=jammiguelyfish.django-fetchlens). To build it yourself instead:

```bash
git clone https://github.com/jammiguelyfish/django-fetchlens
cd django-fetchlens
npm install
npm run package                     # creates django-fetchlens-0.1.1.vsix
code --install-extension django-fetchlens-0.1.1.vsix
```

Open a folder that contains a Django project (a `manage.py`) and trust the workspace. The Django Routes icon appears in the activity bar. The project's dependencies must be installed in the interpreter selected in the Python extension (or set `fetchlens.pythonPath`).

If your settings refuse to load without environment variables, set them in `fetchlens.env`:

```json
{ "fetchlens.env": { "DATABASE_URL": "sqlite:///x.db", "SECRET_KEY": "dev" } }
```

## Limits

- Frontend calls are found statically. A URL built from a variable (`fetch(url)`, `${base}/x`) is skipped, not guessed.
- A call whose method is chosen at runtime (`{ method }`) is matched by URL only.
- Generated API clients (for example from OpenAPI) are only understood if the generated code calls `fetch`/`axios`/`client.get` with literal paths.
- One Django project per workspace folder; use `fetchlens.projectRoot` to pick it in a monorepo.
- It reads the URL configuration by importing your project, so a broken import or missing environment variable shows as an error in the sidebar rather than as routes.

## Compared with

- **PyCharm Professional's Endpoints window** lists and navigates endpoints for Django, but is part of a paid edition and does not check frontend calls.
- **Other VS Code route explorers** (PyPoints, ApiLane, TraceLens) list routes found by scanning source. FetchLens asks Django for the resolved URL configuration instead, and its focus is the other direction: checking the calls your frontend makes against those routes.

## Settings

| Setting | Purpose |
|---|---|
| `fetchlens.pythonPath` | Interpreter with your dependencies. Empty uses the one selected in the Python extension. |
| `fetchlens.projectRoot` | Folder containing `manage.py`. Empty auto-detects. |
| `fetchlens.settingsModule` | `DJANGO_SETTINGS_MODULE`. Empty reads it from `manage.py`. |
| `fetchlens.diagnostics` | Severity of the warnings above, or `off`. |
| `fetchlens.clientReceivers` | Extra object names whose `.get/.post/...` calls count as HTTP calls (default: `axios`, `api`, `http`, `client`, `apiClient`, `$http`, `ky`, `got`, `instance`). |
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
