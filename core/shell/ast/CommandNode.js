"use strict";

(function registerCommandNode(globalScope) {
  const shellAst = globalScope.ShellAst || (globalScope.ShellAst = {});

  class CommandNode {
    constructor(name, args) {
      this.type = "Command";
      this.name = name;
      this.args = Array.isArray(args) ? args : [];
    }
  }

  shellAst.CommandNode = CommandNode;
})(window);
