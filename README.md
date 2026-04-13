# 🖥️ Terminal — Bash Emulator (Web)

A lightweight, browser-based **Bash terminal emulator** built with **HTML, CSS, and JavaScript**.

> ⚠️ This is NOT a real shell. It does NOT execute actual system commands — it only simulates a terminal-like experience.

---

## 🌐 Live Demo

https://terminal.ciphernet.org

---

## 📦 Project Overview

**Terminal** is a front-end project that mimics the look and feel of a Bash terminal.  
It provides a command-line interface simulation directly in the browser.

### Key Points:
- Runs entirely in the browser
- No backend or real shell access
- Safe and sandboxed
- Designed for UI/UX, demos, and learning

---

## 🚀 Features

- Terminal-style interface  
- Command input simulation  
- Output rendering (predefined responses)  
- Styled to resemble a real Bash terminal  
- Lightweight and fast  

---

## ⚙️ Tech Stack

- HTML  
- CSS  
- JavaScript  

---

## ❗ Limitations

- No real command execution  
- No system or filesystem access  
- Commands are hardcoded / simulated  
- Not an actual Bash environment  

---

## 📁 Installation / Usage

```bash
git clone https://github.com/noxx-code/terminal.cipernet.git
cd terminal.cipernet
```

Run the project by opening `index.html` in a browser.

## 🗂️ Project Structure

```text
terminal.cipernet/
├─ assets/
│  ├─ images/
│  │  └─ favicon.png
│  └─ styles/
│     └─ styles.css
├─ config/
│  ├─ commands-manifest.json
│  ├─ manual-pages.json
│  └─ vfs-initial-state.json
├─ core/
│  ├─ script.js
│  └─ keyboard.js
├─ managers/
│  ├─ commandManager.js
│  ├─ manManager.js
│  └─ vfsManager.js
├─ utils/
│  └─ jsonLoader.js
├─ index.html
├─ README.md
└─ LICENSE
```

## 🧩 Folder Roles

- `core`: Main terminal runtime logic and input behavior.
- `utils`: Shared helper modules used by other layers.
- `managers`: Data/domain managers for commands, man pages, and VFS initialization.
- `config`: JSON manifests used at runtime.
- `assets`: Static UI assets such as styles and images.

## 🔄 Runtime Load Order

The page loads scripts in this order to preserve dependencies:

1. `utils/jsonLoader.js`
2. `managers/commandManager.js`
3. `managers/manManager.js`
4. `managers/vfsManager.js`
5. `core/script.js`
6. `core/keyboard.js`
