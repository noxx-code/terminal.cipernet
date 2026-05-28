"use strict";

(function registerOrNode(globalScope) {
  const shellAst = globalScope.ShellAst || (globalScope.ShellAst = {});

  class OrNode {
    constructor(left, right) {
      this.type = "Or";
      this.left = left;
      this.right = right;
    }
  }

  shellAst.OrNode = OrNode;
})(window);
