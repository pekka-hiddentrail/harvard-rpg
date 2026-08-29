# Harvard RPG

Terminal-first university life simulator.

## Requirements

- Node 22+
- npm

## Install

```bash
npm install
```

## Launch Guide

All commands are run from the repo root.

### 1) API server

```bash
npm run server
```

Keep this running when you want the full game client.

### 2) Main game (character creation -> sheet -> planner)

Detached popout window:

```bash
npm run play
```

Inline in current terminal (best for debugging stack traces):

```bash
npm run play:here
```

### 3) Planner screen only

Detached popout window:

```bash
npm run screen
```

Inline in current terminal:

```bash
npm run screen:here
```

Notes:
- This launches the interactive planner directly.
- It can bootstrap an in-memory demo save when no game id is passed.

### 4) Calendar screen only

Detached popout window:

```bash
npm run calendar
```

Note:
- Calendar can also bootstrap an in-memory demo save when no game id is passed.

## Test and Balance

Run tests:

```bash
npm test
```

Run linter:

```bash
npm run lint
```

Run balance harness:

```bash
npm run balance
```

## Troubleshooting

- If `npm run play` says the server is not answering, start `npm run server` first.
- If a popout flashes and closes, run the corresponding `:here` command to see errors in the current terminal.
