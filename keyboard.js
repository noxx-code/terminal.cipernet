"use strict";

(function initOnScreenKeyboard(){
  const isMobile = window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(!isMobile) return;

  document.body.classList.add("mobile-keyboard-active");

  const keyboard = document.createElement("div");
  keyboard.className = "on-screen-keyboard";

  const layout = [
    ["1","2","3","4","5","6","7","8","9","0"],
    ["q","w","e","r","t","y","u","i","o","p"],
    ["a","s","d","f","g","h","j","k","l","Backspace"],
    ["z","x","c","v","b","n","m",".","/","Enter"],
    ["Tab","ArrowLeft","Space","ArrowRight"]
  ];

  function sendKey(key){
    if(typeof window.handleKey !== "function") return;
    const mapped = key === "Space" ? " " : key;
    window.handleKey(mapped, {});
  }

  for(const rowKeys of layout){
    const row = document.createElement("div");
    row.className = "on-screen-keyboard-row";

    for(const key of rowKeys){
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = key === "Space" ? "space" : key;
      if(key === "Backspace" || key === "Enter" || key === "Tab") button.classList.add("key-wide");
      if(key === "Space") button.classList.add("key-space");

      const press = (ev)=>{
        ev.preventDefault();
        sendKey(key);
      };

      button.addEventListener("click", press);
      button.addEventListener("touchstart", press, { passive: false });
      row.appendChild(button);
    }

    keyboard.appendChild(row);
  }

  document.body.appendChild(keyboard);
})();
