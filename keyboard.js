"use strict";

(function initOnScreenKeyboard(){
  const isMobile = window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(!isMobile) return;

  document.body.classList.add("mobile-keyboard-active");

  const keyboard = document.createElement("div");
  keyboard.className = "on-screen-keyboard";

  const utilityLayout = ["Escape", "/", "-", "Home", "ArrowUp", "End", "PageUp", "Control", "Alt", "ArrowLeft", "ArrowDown", "ArrowRight"];
  const layout = [
    ["1","2","3","4","5","6","7","8","9","0"],
    ["q","w","e","r","t","y","u","i","o","p"],
    ["a","s","d","f","g","h","j","k","l","Backspace"],
    ["z","x","c","v","b","n","m",",",".","?","Enter"],
    ["Shift","Space","Backspace","Enter"]
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
  let lastTouchAt = 0;

  function sendKey(key){
    if(typeof window.handleKey !== "function") return;
    const mapped = key === "Space" ? " " : key;
    window.handleKey(mapped, {});
  }

  function isLetter(key){
    return /^[a-z]$/i.test(key);
  }

  function resolveKeyPress(key){
    if(key === "Shift") return null;
    if(shiftEnabled && isLetter(key)) return key.toUpperCase();
    return key;
  }

  function keyLabel(key){
    if(key === "Space") return "space";
    if(symbolMap[key]) return symbolMap[key];
    if(shiftEnabled && isLetter(key)) return key.toUpperCase();
    return key;
  }

  function buildRow(rowKeys, rowClass){
    const row = document.createElement("div");
    row.className = `on-screen-keyboard-row ${rowClass}`;

    for(const key of rowKeys){
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.key = key;
      button.textContent = keyLabel(key);

      if(key === "Backspace" || key === "Enter" || key === "Tab" || key === "Shift") button.classList.add("key-wide");
      if(key === "Space") button.classList.add("key-space");
      if(rowClass === "on-screen-keyboard-utility-row") button.classList.add("key-action");
      if(key === "Backspace" || key === "Enter" || key === "Shift") button.classList.add("key-action");

      const press = (ev)=>{
        ev.preventDefault();

        if(ev.type === "click" && Date.now() - lastTouchAt < 300) return;
        if(ev.type === "touchstart") lastTouchAt = Date.now();

        if(key === "Shift"){
          shiftEnabled = !shiftEnabled;
          keyboard.classList.toggle("shift-active", shiftEnabled);
          refreshLabels();
          return;
        }

        const resolved = resolveKeyPress(key);
        if(resolved) sendKey(resolved);
      };

      button.addEventListener("click", press);
      button.addEventListener("touchstart", press, { passive: false });
      row.appendChild(button);
    }

    keyboard.appendChild(row);
  }

  function refreshLabels(){
    const keys = keyboard.querySelectorAll("button[data-key]");
    for(const button of keys){
      const key = button.dataset.key;
      if(!key) continue;
      button.textContent = keyLabel(key);
      if(key === "Shift") button.classList.toggle("key-toggled", shiftEnabled);
    }
  }

  keyboard.addEventListener("touchmove", (ev)=>{
    ev.preventDefault();
  }, { passive: false });

  buildRow(utilityLayout, "on-screen-keyboard-utility-row");
  for(const rowKeys of layout) buildRow(rowKeys, "on-screen-keyboard-main-row");

  document.body.appendChild(keyboard);
})();
