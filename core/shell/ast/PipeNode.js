"use strict";

(function registerPipeNode(globalScope) {
  const shellAst = globalScope.ShellAst || (globalScope.ShellAst = {});

  class PipeNode {
    constructor(left, right) {
      this.type = "Pipe";
      this.left = left;
      this.right = right;
    }
  }

  shellAst.PipeNode = PipeNode;
})(window);
