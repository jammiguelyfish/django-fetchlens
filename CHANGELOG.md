# Changelog

## 0.1.1

- New extension icon: a lens following a call to its view.

## 0.1.0

- Routes sidebar and "Go to route..." search, read from Django's resolved URL configuration.
- Frontend calls (`fetch`, axios-style clients, `request("POST", path)` wrappers) get a label with the view that handles them, and Ctrl+click jumps to it.
- Warnings for unknown routes, methods the view does not accept, and missing trailing slashes, with a quick fix for the slash and `// fetchlens-ignore`.
- Handlers inherited from DRF mixins or Django generic views land on the view class in your code instead of in site-packages.
