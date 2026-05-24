# WEBLINUX — Browser Terminal Emulator (v1.3)

A lightweight, browser-native terminal emulator that simulates a Bash-like experience in the browser. Designed for demos, learning, and UI exploration — not a real shell.

> ⚠️ SECURITY NOTE: This project simulates a terminal UI only. It does not execute system-level commands or access the host filesystem.

---

## Live demo

https://terminal.ciphernet.org

---

## Quick start

1. Clone the repository:

```bash
git clone https://github.com/noxx-code/terminal.cipernet.git
cd terminal.cipernet
```

2. Open `index.html` in a modern browser (Chrome, Firefox, Edge).

For a simple local web server (recommended for some browsers):

```bash
# Python 3
python -m http.server 3000
# then open http://localhost:3000
```

---

## What it is

- Browser-only terminal emulator built with vanilla HTML/CSS/JS
- Command responses are simulated; commands do not run on your machine
- Lightweight, minimal dependencies, easy to fork and customize

---

## Features

- Styled terminal UI with CRT/matrix visual effects
- Command parsing and simulated command table
- Virtual filesystem (VFS) seeded from JSON manifests
- Simple in-browser `nano`-style editor overlay
- Boot/login screen with a cinematic visual theme

---

## Project layout

```
terminal.cipernet/
├─ assets/
│  ├─ images/
│  └─ styles/
├─ config/
│  ├─ commands-manifest.json
│  ├─ manual-pages.json
│  └─ vfs-initial-state.json
├─ core/
│  ├─ inputManager.js    # keyboard/input handling
│  ├─ nanoEditor.js      # in-browser nano-like editor
│  └─ script.js          # terminal runtime + boot/login logic
├─ managers/
│  ├─ commandManager.js  # command implementations
│  ├─ manManager.js
│  └─ vfsManager.js
├─ utils/
│  └─ jsonLoader.js
├─ index.html
├─ README.md
└─ LICENSE
```

---

## Nano editor (in-browser)

The project includes a small overlay editor inspired by `nano`.

- Open with: `nano <path>` (e.g., `nano hello.txt`)
- Shortcuts:
  - `Ctrl+O` — Save to virtual filesystem
  - `Ctrl+X` — Exit editor
  - `Ctrl+G` — Help

The editor operates on the project's virtual filesystem and does not modify files on your host disk.

---

## Development notes

- Scripts are loaded in order (see `index.html`) to preserve dependencies.
- Most runtime configuration lives under `config/` as JSON manifests.
- The fake authentication and login flow are implemented in `core/script.js` and are intentionally client-side.

---

## Contributing

Contributions are welcome. Suggested starter tasks:

- Add more simulated commands under `managers/commandManager.js`
- Extend the VFS seed data in `config/vfs-initial-state.json`
- Improve accessibility and keyboard handling in `core/inputManager.js`

Please open issues or PRs against the `main` branch.

---

If you want, I can also add a short `CHANGELOG.md`, contributor guide, or update the demo link to a different host. Tell me what to include next.
