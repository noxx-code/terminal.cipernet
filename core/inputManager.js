"use strict";

(function registerInputManager(globalScope) {
  const NAVIGATION_KEYS = new Set([
    'Enter',
    'Backspace',
    'Delete',
    'Tab',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End'
  ]);

  class InputManager {
    constructor(options) {
      const {
        inputElement,
        terminalElement,
        onText,
        onKey,
        onPaste,
        onCompositionStart,
        onCompositionEnd
      } = options || {};

      if (!inputElement) throw new Error('InputManager requires an inputElement.');
      if (!terminalElement) throw new Error('InputManager requires a terminalElement.');

      this.inputElement = inputElement;
      this.terminalElement = terminalElement;
      this.onText = typeof onText === 'function' ? onText : () => {};
      this.onKey = typeof onKey === 'function' ? onKey : () => false;
      this.onPaste = typeof onPaste === 'function' ? onPaste : null;
      this.onCompositionStart = typeof onCompositionStart === 'function' ? onCompositionStart : null;
      this.onCompositionEnd = typeof onCompositionEnd === 'function' ? onCompositionEnd : null;

      this.isComposing = false;
      this.isEnabled = true;

      this.handleTerminalPointerDown = this.handleTerminalPointerDown.bind(this);
      this.handleInputKeyDown = this.handleInputKeyDown.bind(this);
      this.handleInputEvent = this.handleInputEvent.bind(this);
      this.handlePasteEvent = this.handlePasteEvent.bind(this);
      this.handleCompositionStartEvent = this.handleCompositionStartEvent.bind(this);
      this.handleCompositionEndEvent = this.handleCompositionEndEvent.bind(this);
      this.handleInputBlur = this.handleInputBlur.bind(this);

      this.attach();
    }

    attach() {
      this.inputElement.value = '';
      this.terminalElement.addEventListener('pointerdown', this.handleTerminalPointerDown);
      this.terminalElement.addEventListener('touchstart', this.handleTerminalPointerDown, { passive: true });
      this.inputElement.addEventListener('keydown', this.handleInputKeyDown);
      this.inputElement.addEventListener('input', this.handleInputEvent);
      this.inputElement.addEventListener('paste', this.handlePasteEvent);
      this.inputElement.addEventListener('compositionstart', this.handleCompositionStartEvent);
      this.inputElement.addEventListener('compositionend', this.handleCompositionEndEvent);
      this.inputElement.addEventListener('blur', this.handleInputBlur);
    }

    setEnabled(isEnabled) {
      this.isEnabled = !!isEnabled;
      this.inputElement.disabled = !this.isEnabled;
      if (this.isEnabled) this.focus();
    }

    focus() {
      if (!this.isEnabled) return;
      this.inputElement.focus({ preventScroll: true });
    }

    blur() {
      this.inputElement.blur();
    }

    clearInputValue() {
      this.inputElement.value = '';
    }

    emitText(text) {
      if (!text) return;
      this.onText(text);
    }

    handleTerminalPointerDown() {
      this.focus();
    }

    handleInputBlur() {
      if (!this.isEnabled) return;
      this.focus();
    }

    handleInputKeyDown(event) {
      if (!this.isEnabled) return;

      // Let IME own key processing while composing candidate text.
      if (this.isComposing || event.isComposing) return;

      const isShortcut = event.ctrlKey || event.altKey || event.metaKey;
      const isNavigationKey = NAVIGATION_KEYS.has(event.key);

      if (!isNavigationKey && !isShortcut) return;

      if (this.onKey(event.key, event)) event.preventDefault();
    }

    handleInputEvent() {
      if (!this.isEnabled) return;
      if (this.isComposing) return;

      const text = this.inputElement.value.replace(/[\r\n]+/g, '');
      this.clearInputValue();
      this.emitText(text);
    }

    handlePasteEvent(event) {
      if (!this.isEnabled) return;

      event.preventDefault();
      const pastedText = (event.clipboardData || globalScope.clipboardData).getData('text').replace(/[\r\n]+/g, '');

      if (this.onPaste) this.onPaste(pastedText, event);
      else this.emitText(pastedText);

      this.clearInputValue();
    }

    handleCompositionStartEvent(event) {
      this.isComposing = true;
      if (this.onCompositionStart) this.onCompositionStart(event);
    }

    handleCompositionEndEvent(event) {
      this.isComposing = false;

      const committedText = this.inputElement.value.replace(/[\r\n]+/g, '');
      this.clearInputValue();
      this.emitText(committedText);

      if (this.onCompositionEnd) this.onCompositionEnd(event, committedText);
    }

    destroy() {
      this.terminalElement.removeEventListener('pointerdown', this.handleTerminalPointerDown);
      this.terminalElement.removeEventListener('touchstart', this.handleTerminalPointerDown);
      this.inputElement.removeEventListener('keydown', this.handleInputKeyDown);
      this.inputElement.removeEventListener('input', this.handleInputEvent);
      this.inputElement.removeEventListener('paste', this.handlePasteEvent);
      this.inputElement.removeEventListener('compositionstart', this.handleCompositionStartEvent);
      this.inputElement.removeEventListener('compositionend', this.handleCompositionEndEvent);
      this.inputElement.removeEventListener('blur', this.handleInputBlur);
    }
  }

  globalScope.InputManager = InputManager;
})(window);
