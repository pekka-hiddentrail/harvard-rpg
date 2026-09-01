# Harvard RPG

Browser-first university life simulator.

## Requirements

- Node 22+
- npm

## Install

```bash
npm install
```

## Launch Guide

All commands are run from the repo root. Both the server and the client need to be
running at once — the client is a thin renderer over the server's HTTP view models
(ARCHITECTURE §2) and holds zero game rules of its own.

### 1) API server

```bash
npm run server
```

Serves on `http://127.0.0.1:4711` by default (override with `PORT`). Keep this running
in one terminal.

### 2) Client (browser)

```bash
npm run gui
```

Starts the Vite dev server on `http://localhost:5173` and opens in a browser window.

To jump straight to a specific screen during development rather than clicking through
from the welcome screen, append `?screen=<name>` to the URL — `character`, `traits`,
`calendar`, `timeline`, or `courseRegistration` (`npm run gui:character` does this for
character creation specifically).

Any direct jump past the trait screen skips the step that writes a save, so there would be
nothing to shop for. The scaffolding posts the `pekka` preset to `/api/game/new` on the way
in and shops for that — which means `?screen=courseRegistration` needs the API server up,
and shows prices for Pekka's build rather than one you picked.

## Test and Balance

Run all tests (engine, content, server — Node's test runner):

```bash
npm test
```

Run the client's own browser tests (Vitest + jsdom):

```bash
npm run gui:test
```

Run the linter:

```bash
npm run lint
```

Run the balance harness (plays many days headlessly against a set of strategies):

```bash
npm run balance
```

## Troubleshooting

- If the client shows "No server on http://127.0.0.1:4711", start `npm run server`
  first — the client fetches content and resolves days over HTTP, it never computes
  game rules itself.
- `npm run gui:build` type-checks and builds the client for production.
