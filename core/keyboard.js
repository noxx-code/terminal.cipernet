"use strict";

(function initOnScreenKeyboard(){
  const isLikelyTouchDevice = window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(!isLikelyTouchDevice) return;

  document.body.classList.add("mobile-keyboard-active");

  const keyboardElement = document.createElement("div");
  keyboardElement.className = "on-screen-keyboard";

  const utilityRowKeyRows = [
    ["Escape", "\"", "-", "<", "ArrowUp", ">"],
    ["$", "Control", "Alt", "ArrowLeft", "ArrowDown", "ArrowRight"]
  ];
  const mainKeyRows = [
    ["1","2","3","4","5","6","7","8","9","0"],
    ["q","w","e","r","t","y","u","i","o","p"],
    ["a","s","d","f","g","h","j","k","l","⌫"],
    ["z","x","c","v","b","n","m",",",".","?","↵"],
    ["⇧","symbol","Space","⌫","↵"]
  ];
  const symbolUtilityRowKeyRows = [
    ["Escape", "\"", "-", "<", "ArrowUp", ">"],
    ["$", "Control", "Alt", "ArrowLeft", "ArrowDown", "ArrowRight"]
  ];
  const symbolMainKeyRows = [
    ["!","@","#","$","%","^","&","*","(",")"],
    ["[","]","{","}","<",">","=","+","-","_"],
    [";",":","'","\"","/","\\","|","⌫"],
    ["&&","||","`","~",".",",","?","!","↵"],
    ["⇧","abc","Space","⌫","↵"]
  ];
  const symbolMap = {
    Escape: "ESC",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Control: "CTRL",
    Alt: "ALT",
    Home: "HOME",
    End: "END",
    PageUp: "PGUP"
  };
  let shiftEnabled = false;
  let isSymbolMode = false;
  let lastTouchAt = 0;

  function toggleKeyboard() {
    isSymbolMode = !isSymbolMode;
  }

  function sendKeyToTerminal(key){
    if(typeof window.handleKey !== "function") return;
    const mappedKey = key === "Space" ? " " : key;
    window.handleKey(mappedKey, {});
  }

  function isAlphabeticKey(key){
    return /^[a-z]$/i.test(key);
  }

  function normalizeKeyLabel(key){
    if(key === "⌫") return "Backspace";
    if(key === "↵") return "Enter";
    if(key === "⇧") return "Shift";
    return key;
  }

  function resolveKeyValue(key){
    const normalizedKey = normalizeKeyLabel(key);
    if(normalizedKey === "Shift") return null;
    if(shiftEnabled && isAlphabeticKey(normalizedKey)) return normalizedKey.toUpperCase();
    return normalizedKey;
  }

  function getKeyLabel(key){
    const normalizedKey = normalizeKeyLabel(key);
    if(normalizedKey === "Space") return "space";
    if(symbolMap[normalizedKey]) return symbolMap[normalizedKey];
    if(shiftEnabled && isAlphabeticKey(normalizedKey)) return normalizedKey.toUpperCase();
    return key;
  }

  function buildRow(rowKeys, rowClass){
    const rowElement = document.createElement("div");
    rowElement.className = `on-screen-keyboard-row ${rowClass}`;

    for(const key of rowKeys){
      const keyButton = document.createElement("button");
      keyButton.type = "button";
      keyButton.dataset.key = key;
      keyButton.textContent = getKeyLabel(key);

      const normalizedKey = normalizeKeyLabel(key);

      if(normalizedKey === "Backspace" || normalizedKey === "Enter" || normalizedKey === "Tab" || normalizedKey === "Shift") keyButton.classList.add("key-wide");
      if(normalizedKey === "Space") keyButton.classList.add("key-space");
      if(rowClass === "on-screen-keyboard-utility-row") keyButton.classList.add("key-action");
      if(normalizedKey === "Backspace" || normalizedKey === "Enter" || normalizedKey === "Shift") keyButton.classList.add("key-action");

      const onPress = (event)=>{
        event.preventDefault();

        if(event.type === "click" && Date.now() - lastTouchAt < 300) return;
        if(event.type === "touchstart") lastTouchAt = Date.now();

        if (key === "symbol" || key === "abc") {
          toggleKeyboard();
          renderKeyboard();
          return;
        }

        if(normalizedKey === "Shift"){
          shiftEnabled = !shiftEnabled;
          keyboardElement.classList.toggle("shift-active", shiftEnabled);
          refreshKeyLabels();
          return;
        }

        const resolvedKey = resolveKeyValue(key);
        if(resolvedKey) sendKeyToTerminal(resolvedKey);
      };

      keyButton.addEventListener("click", onPress);
      keyButton.addEventListener("touchstart", onPress, { passive: false });
      rowElement.appendChild(keyButton);
    }

    keyboardElement.appendChild(rowElement);
  }

  function refreshKeyLabels(){
    const keyButtons = keyboardElement.querySelectorAll("button[data-key]");
    for(const button of keyButtons){
      const key = button.dataset.key;
      if(!key) continue;
      const normalizedKey = normalizeKeyLabel(key);
      button.textContent = getKeyLabel(key);
      if(normalizedKey === "Shift") button.classList.toggle("key-toggled", shiftEnabled);
    }
  }

  // Prevent page scrolling while swiping on the keyboard area.
  keyboardElement.addEventListener("touchmove", (event)=>{
    event.preventDefault();
  }, { passive: false });

  function renderKeyboard(){
    keyboardElement.innerHTML = "";

    const activeUtilityRows = isSymbolMode
      ? symbolUtilityRowKeyRows
      : utilityRowKeyRows;

    const activeMainRows = isSymbolMode
      ? symbolMainKeyRows
      : mainKeyRows;

    for(const rowKeys of activeUtilityRows) buildRow(rowKeys, "on-screen-keyboard-utility-row");
    for(const rowKeys of activeMainRows) buildRow(rowKeys, "on-screen-keyboard-main-row");
  }

  renderKeyboard();

  document.body.appendChild(keyboardElement);
})();
