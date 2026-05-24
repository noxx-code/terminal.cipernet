"use strict";

(function registerRedirectNode(globalScope) {
  const shellAst = globalScope.ShellAst || (globalScope.ShellAst = {});

  class RedirectNode {
    constructor(command, mode, target) {
      this.type = "Redirect";
      this.command = command;
      this.mode = mode;
      this.target = target;
    }
  }

  shellAst.RedirectNode = RedirectNode;
})(window);
