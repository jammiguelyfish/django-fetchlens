"""Print every URL route a Django project serves, as JSON.

Run with the project's own interpreter:

    python fetchlens_routes.py --root <folder with manage.py> [--settings pkg.settings]

It calls django.setup() and walks the resolver Django itself builds, so include(),
namespaces and DRF routers are handled exactly as at runtime. On failure it prints
{"error": "...", "traceback": "..."} and exits 0, so the editor can show the message.
"""
import argparse
import inspect
import json
import os
import re
import sys
import traceback

HTTP = ["get", "post", "put", "patch", "delete", "head", "options", "trace"]


def settings_from_manage(root):
    try:
        text = open(os.path.join(root, "manage.py"), encoding="utf-8").read()
    except OSError:
        return None
    m = re.search(r"DJANGO_SETTINGS_MODULE['\"]\s*,\s*['\"]([\w.]+)['\"]", text)
    return m.group(1) if m else None


def unwrap(fn):
    seen = set()
    while hasattr(fn, "__wrapped__") and id(fn) not in seen:
        seen.add(id(fn))
        fn = fn.__wrapped__
    return fn


def location(obj, root):
    """(relative file, line) of a function or class, or (None, None)."""
    try:
        obj = unwrap(obj)
        if isinstance(obj, property):
            obj = obj.fget
        path = inspect.getsourcefile(obj)
        line = inspect.getsourcelines(obj)[1]
    except (TypeError, OSError):
        return None, None
    if not path:
        return None, None
    path = os.path.abspath(path)
    return path, line


def closure_function(handler):
    """DRF's @api_view wraps the real function in a closure; dig it out."""
    for cell in getattr(handler, "__closure__", None) or ():
        try:
            c = cell.cell_contents
        except ValueError:
            continue
        if inspect.isfunction(c):
            return c
    return None


def decorator_methods(fn):
    """Methods allowed by Django's @require_http_methods / @require_GET / @require_POST."""
    seen = set()
    while fn is not None and id(fn) not in seen:
        seen.add(id(fn))
        code = getattr(fn, "__code__", None)
        if code is not None and "request_method_list" in code.co_freevars:
            cells = dict(zip(code.co_freevars, fn.__closure__ or ()))
            try:
                return sorted(m.upper() for m in cells["request_method_list"].cell_contents)
            except (ValueError, KeyError, TypeError):
                return None
        fn = getattr(fn, "__wrapped__", None)
    return None


def describe_view(callback):
    """Return (view name, {METHOD: (file, line)} or None for 'any', primary location)."""
    cls = getattr(callback, "cls", None) or getattr(callback, "view_class", None)
    actions = getattr(callback, "actions", None)  # DRF ViewSet.as_view({'get': 'list'})
    name = getattr(callback, "__name__", None) or type(callback).__name__

    if cls is not None:
        name = cls.__name__
        handlers = {}
        if actions:
            for method, action in actions.items():
                fn = getattr(cls, action, None)
                if fn is not None:
                    handlers[method.upper()] = (action, fn)
        else:
            allowed = [m for m in getattr(cls, "http_method_names", HTTP) if m in HTTP]
            for m in allowed:
                fn = getattr(cls, m, None)
                if fn is None and m == "head" and hasattr(cls, "get"):
                    continue  # View.setup() maps HEAD to GET
                if fn is not None and m != "options":
                    handlers[m.upper()] = (m, fn)
                elif m == "options" and "options" in cls.__dict__:
                    handlers["OPTIONS"] = (m, fn)
        out = {}
        for method, (action, fn) in handlers.items():
            real = closure_function(fn) or fn
            f, ln = location(real, None)
            if f is None:
                f, ln = location(cls, None)
            out[method] = {"name": f"{name}.{action}" if not closure_function(fn) else name, "file": f, "line": ln}
        cf, cl = location(cls, None)
        # api_view wrappers live in DRF; prefer a handler's location for the primary one
        if out:
            first = next(iter(out.values()))
            cf, cl = first["file"] or cf, first["line"] or cl
        return name, out or None, (cf, cl)

    f, ln = location(callback, None)
    methods = decorator_methods(callback)
    if methods:
        handlers = {m: {"name": name, "file": f, "line": ln} for m in methods}
        return name, handlers, (f, ln)
    return name, None, (f, ln)


def display_path(prefix, pattern):
    return prefix + str(pattern)


def join_regex(prefix_re, pattern):
    r = pattern.regex.pattern
    if prefix_re:
        r = r.lstrip("^")
        prefix_re = prefix_re.rstrip("$")
        prefix_re = re.sub(r"\\Z$", "", prefix_re)
    return prefix_re + r


def display_from_regex(regex):
    """'^api/v1/products/(?P<pk>[^/.]+)/$' -> 'api/v1/products/<pk>/' (for DRF routers and re_path)."""
    s = regex
    s = re.sub(r"\(\?P<(\w+)>(?:[^()\\]|\\.|\([^()]*\))*\)", r"<\1>", s)  # named groups
    s = s.replace("\\Z", "")
    s = s.lstrip("^").rstrip("$")
    s = s.replace("/?", "/") if s.endswith("/?") else s
    s = re.sub(r"\\(.)", r"\1", s)  # unescape \.
    return s.replace("^", "").replace("$", "")


def is_format_suffix(route):
    return "<drf_format_suffix:format>" in route["pattern"] or "(?P<format>" in route["regex"]


def walk(patterns, prefix="", prefix_re="", ns="", out=None):
    from django.urls import URLPattern, URLResolver

    out = [] if out is None else out
    for p in patterns:
        if isinstance(p, URLResolver):
            sub_ns = ns + (p.namespace + ":" if p.namespace else "")
            walk(p.url_patterns, prefix + str(p.pattern), join_regex(prefix_re, p.pattern), sub_ns, out)
        elif isinstance(p, URLPattern):
            out.append(
                {
                    "pattern": prefix + str(p.pattern),
                    "regex": join_regex(prefix_re, p.pattern),
                    "name": (ns + p.name) if p.name else None,
                    "callback": p.callback,
                    "is_regex": not hasattr(p.pattern, "_route"),
                }
            )
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--settings", default="")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    sys.path.insert(0, root)
    os.chdir(root)
    mod = a.settings or os.environ.get("DJANGO_SETTINGS_MODULE") or settings_from_manage(root)
    if not mod:
        print(json.dumps({"error": "Could not find DJANGO_SETTINGS_MODULE. Set fetchlens.settingsModule."}))
        return
    os.environ["DJANGO_SETTINGS_MODULE"] = mod
    try:
        import django
        from django.urls import get_resolver

        django.setup()
        raw = walk(get_resolver().url_patterns)
        routes = []
        for r in raw:
            if is_format_suffix(r):
                continue  # DRF's '.json' / '.api' duplicates are noise in an editor
            if any(c in r["pattern"] for c in "^$(") or r["is_regex"]:
                r["pattern"] = display_from_regex(r["regex"])
            name, handlers, (file, line) = describe_view(r["callback"])
            external = bool(file) and (
                not os.path.abspath(file).startswith(root)
                or "site-packages" in file
                or "dist-packages" in file
                or os.sep + "venv" + os.sep in file
            )
            routes.append(
                {
                    "external": external,
                    "pattern": r["pattern"],
                    "regex": r["regex"],
                    "name": r["name"],
                    "view": name,
                    "methods": sorted(handlers) if handlers else None,
                    "handlers": handlers,
                    "file": file,
                    "line": line,
                    "isRegex": r["is_regex"],
                }
            )
        print(json.dumps({"django": django.get_version(), "settings": mod, "routes": routes}))
    except BaseException as e:  # noqa: BLE001 - report anything, including SystemExit from settings
        print(json.dumps({"error": f"{type(e).__name__}: {e}", "traceback": traceback.format_exc()}))


if __name__ == "__main__":
    main()
