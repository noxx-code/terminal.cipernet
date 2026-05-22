"use strict";

(function registerNanoEditor(globalScope) {
  const DEFAULT_TITLE = 'GNU nano 6.5';

  class NanoEditorController {
    constructor() {
      this.isInitialized = false;
      this.isOpen = false;
      this.isDirty = false;
      this.confirmExit = false;
      this.snapshot = '';
      this.filePath = '';
      this.cwd = '/';
      this.deps = {};
      this.elements = null;

      this.handleEditorInput = this.handleEditorInput.bind(this);
      this.handleEditorKeyDown = this.handleEditorKeyDown.bind(this);
    }

    init(dependencies = {}) {
      if (this.isInitialized) return true;

      const overlayElement = document.getElementById('nano-overlay');
      const editorElement = document.getElementById('nano-editor');
      const titleElement = document.getElementById('nano-title');
      const fileElement = document.getElementById('nano-file');
      const messageElement = document.getElementById('nano-message');
      const footerElement = document.getElementById('nano-footer');
      const helpElement = document.getElementById('nano-help');

      if (!overlayElement || !editorElement || !titleElement || !fileElement || !messageElement || !footerElement || !helpElement) {
        console.warn('NanoEditor: overlay markup is missing');
        return false;
      }

      this.elements = {
        overlay: overlayElement,
        editor: editorElement,
        title: titleElement,
        file: fileElement,
        message: messageElement,
        footer: footerElement,
        help: helpElement,
      };

      this.deps = {
        resolvePath: typeof dependencies.resolvePath === 'function' ? dependencies.resolvePath : null,
        readFile: typeof dependencies.readFile === 'function' ? dependencies.readFile : null,
        writeFile: typeof dependencies.writeFile === 'function' ? dependencies.writeFile : null,
        getInfo: typeof dependencies.getInfo === 'function' ? dependencies.getInfo : null,
        setTerminalMode: typeof dependencies.setTerminalMode === 'function' ? dependencies.setTerminalMode : null,
        focusTerminal: typeof dependencies.focusTerminal === 'function' ? dependencies.focusTerminal : null,
      };

      this.elements.editor.addEventListener('input', this.handleEditorInput);
      this.elements.editor.addEventListener('keydown', this.handleEditorKeyDown);
      this.elements.title.textContent = DEFAULT_TITLE;
      this.hideHelp();
      this.setMessage('Ctrl+G for help.');
      this.refreshFooter();

      this.isInitialized = true;
      return true;
    }

    isActive() {
      return this.isOpen;
    }

    resolvePath(filePath, cwd) {
      if (this.deps.resolvePath) return this.deps.resolvePath(filePath, cwd);
      return filePath;
    }

    readFile(filePath, cwd) {
      if (!this.deps.readFile) return null;
      return this.deps.readFile(filePath, cwd);
    }

    writeFile(filePath, cwd, content) {
      if (!this.deps.writeFile) return false;
      return this.deps.writeFile(filePath, cwd, content);
    }

    getInfo(filePath, cwd) {
      if (!this.deps.getInfo) return null;
      return this.deps.getInfo(filePath, cwd);
    }

    setTerminalMode(mode) {
      if (this.deps.setTerminalMode) this.deps.setTerminalMode(mode);
    }

    focusTerminal() {
      if (this.deps.focusTerminal) this.deps.focusTerminal();
    }

    setMessage(message) {
      if (!this.elements) return;
      this.elements.message.textContent = message || '';
    }

    setEditorContent(content) {
      if (!this.elements) return;
      this.elements.editor.value = content || '';
      this.elements.editor.setSelectionRange(this.elements.editor.value.length, this.elements.editor.value.length);
    }

    refreshHeader() {
      if (!this.elements) return;
      const modifiedSuffix = this.isDirty ? ' [Modified]' : '';
      const displayPath = this.filePath || '[ No File ]';
      this.elements.file.textContent = `${displayPath}${modifiedSuffix}`;
      this.elements.title.textContent = DEFAULT_TITLE;
      this.elements.overlay.setAttribute('aria-hidden', this.isOpen ? 'false' : 'true');
    }

    refreshFooter() {
      if (!this.elements) return;
      this.elements.footer.textContent = '^G Help  ^O Write Out  ^X Exit';
    }

    showHelp() {
      if (!this.elements) return;
      this.elements.help.hidden = false;
      this.setMessage('Nano help: Ctrl+O write out, Ctrl+X exit, Ctrl+G hide help.');
    }

    hideHelp() {
      if (!this.elements) return;
      this.elements.help.hidden = true;
    }

    toggleHelp() {
      if (!this.elements) return;
      if (this.elements.help.hidden) this.showHelp();
      else {
        this.hideHelp();
        this.setMessage(this.isDirty ? 'Modified buffer. Press Ctrl+O to write out.' : 'Ready.');
      }
    }

    insertAtCursor(text) {
      const editor = this.elements.editor;
      const start = editor.selectionStart ?? editor.value.length;
      const end = editor.selectionEnd ?? editor.value.length;
      const nextValue = `${editor.value.slice(0, start)}${text}${editor.value.slice(end)}`;
      editor.value = nextValue;
      const nextCursor = start + text.length;
      editor.setSelectionRange(nextCursor, nextCursor);
      this.handleEditorInput();
    }

    markDirtyFromEditor() {
      const currentValue = this.elements.editor.value;
      this.isDirty = currentValue !== this.snapshot;
      if (this.isDirty) this.confirmExit = false;
      this.refreshHeader();
    }

    handleEditorInput() {
      if (!this.isOpen) return;
      this.markDirtyFromEditor();
    }

    handleEditorKeyDown(event) {
      if (!this.isOpen) return false;

      const key = event.key.toLowerCase();
      const hasCommandModifier = event.ctrlKey || event.metaKey;

      if (hasCommandModifier && key === 'g') {
        event.preventDefault();
        this.toggleHelp();
        return true;
      }

      if (hasCommandModifier && key === 'o') {
        event.preventDefault();
        this.save();
        return true;
      }

      if (hasCommandModifier && key === 'x') {
        event.preventDefault();
        this.requestExit();
        return true;
      }

      if (hasCommandModifier && key === 's') {
        event.preventDefault();
        this.save();
        return true;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        this.insertAtCursor('\t');
        return true;
      }

      if (event.key === 'Escape' && !this.elements.help.hidden) {
        event.preventDefault();
        this.hideHelp();
        this.setMessage(this.isDirty ? 'Modified buffer. Press Ctrl+O to write out.' : 'Ready.');
        return true;
      }

      return false;
    }

    open(filePath, cwd) {
      if (!this.isInitialized) {
        return { success: false, message: 'nano: editor is not available' };
      }

      const requestedPath = String(filePath || '').trim();
      if (!requestedPath) {
        return { success: false, message: 'nano: missing file operand' };
      }

      const absolutePath = this.resolvePath(requestedPath, cwd);
      const existingInfo = this.getInfo(requestedPath, cwd);
      if (existingInfo && existingInfo.type === 'directory') {
        return { success: false, message: `nano: ${requestedPath}: Is a directory` };
      }

      const initialContent = this.readFile(absolutePath, cwd);
      const editorContent = initialContent === null ? '' : initialContent;

      this.filePath = absolutePath;
      this.cwd = cwd || '/';
      this.snapshot = editorContent;
      this.isDirty = false;
      this.confirmExit = false;
      this.isOpen = true;

      this.elements.overlay.hidden = false;
      this.elements.overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('nano-active');
      this.setTerminalMode('nano');
      this.setEditorContent(editorContent);
      this.hideHelp();
      this.refreshHeader();
      this.setMessage(`Editing ${this.filePath}. Ctrl+O writes out, Ctrl+X exits.`);

      window.requestAnimationFrame(() => {
        this.elements.editor.focus({ preventScroll: true });
      });

      return { success: true };
    }

    save() {
      if (!this.isOpen) return false;

      const content = this.elements.editor.value;
      const ok = this.writeFile(this.filePath, this.cwd, content);
      if (!ok) {
        this.setMessage(`nano: error writing ${this.filePath}`);
        return false;
      }

      this.snapshot = content;
      this.isDirty = false;
      this.confirmExit = false;
      this.refreshHeader();
      this.setMessage(`${this.filePath} ${content.length} bytes written`);
      this.elements.editor.focus({ preventScroll: true });
      return true;
    }

    requestExit() {
      if (!this.isOpen) return false;

      if (this.isDirty && !this.confirmExit) {
        this.confirmExit = true;
        this.setMessage('Modified buffer. Press Ctrl+O to write out or Ctrl+X again to exit without saving.');
        return true;
      }

      this.close();
      return true;
    }

    close() {
      if (!this.isOpen) return;

      this.isOpen = false;
      this.confirmExit = false;
      this.hideHelp();
      this.elements.overlay.hidden = true;
      this.elements.overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('nano-active');
      this.setTerminalMode('normal');
      this.setMessage('');
      this.focusTerminal();
    }
  }

  globalScope.NanoEditor = new NanoEditorController();
})(window);