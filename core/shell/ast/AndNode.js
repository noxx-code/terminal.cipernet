"use strict";

(function registerAndNode(globalScope) {
  const shellAst = globalScope.ShellAst || (globalScope.ShellAst = {});

  class AndNode {
    constructor(left, right) {
      this.type = "And";
      this.left = left;
      this.right = right;
    }
  }

  shellAst.AndNode = AndNode;
})(window);
