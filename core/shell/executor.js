"use strict";

(function registerShellExecutor(globalScope) {
  function normalizeResult(result) {
    const safeResult = result && typeof result === "object" ? result : {};
    return {
      stdout: typeof safeResult.stdout === "string" ? safeResult.stdout : "",
      stderr: typeof safeResult.stderr === "string" ? safeResult.stderr : "",
      exitCode: Number.isInteger(safeResult.exitCode) ? safeResult.exitCode : 0,
      control: typeof safeResult.control === "string" ? safeResult.control : "",
    };
  }

  function appendText(base, extra) {
    if (!extra) return base;
    if (!base) return extra;
    return `${base}\n${extra}`;
  }

  class ShellExecutor {
    constructor(options) {
      const opts = options || {};
      if (!opts.commandRuntime) {
        throw new Error("ShellExecutor requires a commandRuntime");
      }
      this.commandRuntime = opts.commandRuntime;
    }

    async execute(node, context) {
      if (!node || typeof node !== "object") {
        return normalizeResult({ stderr: "shell: invalid AST", exitCode: 2 });
      }

      if (node.type === "Command") {
        return this.executeCommand(node, context);
      }

      if (node.type === "Pipe") {
        return this.executePipe(node, context);
      }

      if (node.type === "Redirect") {
        return this.executeRedirect(node, context);
      }

      if (node.type === "And") {
        return this.executeAnd(node, context);
      }

      return normalizeResult({ stderr: `shell: unsupported AST node '${node.type}'`, exitCode: 2 });
    }

    async executeCommand(node, context) {
      const result = await this.commandRuntime.execute(node.name, node.args, context);
      return normalizeResult(result);
    }

    async executePipe(node, context) {
      const leftResult = await this.execute(node.left, context);
      const rightContext = Object.assign({}, context, { stdin: leftResult.stdout });
      const rightResult = await this.execute(node.right, rightContext);

      return normalizeResult({
        stdout: rightResult.stdout,
        stderr: appendText(leftResult.stderr, rightResult.stderr),
        exitCode: rightResult.exitCode,
        control: rightResult.control,
      });
    }

    async executeRedirect(node, context) {
      const result = await this.execute(node.command, context);

      if (result.stdout) {
        const vfs = context && context.vfs;
        if (!vfs || (typeof vfs.write !== "function" && typeof vfs.append !== "function")) {
          return normalizeResult({
            stdout: "",
            stderr: "shell: redirect failed: VFS is unavailable",
            exitCode: 1,
          });
        }

        const cwd = context && typeof context.cwd === "string" ? context.cwd : "/";
        const ok = node.mode === ">>"
          ? vfs.append(node.target, cwd, result.stdout)
          : vfs.write(node.target, cwd, result.stdout);

        if (!ok) {
          return normalizeResult({
            stdout: "",
            stderr: `shell: redirect failed: cannot write to ${node.target}`,
            exitCode: 1,
          });
        }
      }

      return normalizeResult({
        stdout: "",
        stderr: result.stderr,
        exitCode: result.exitCode,
        control: result.control,
      });
    }

    async executeAnd(node, context) {
      const leftResult = await this.execute(node.left, context);
      if (leftResult.exitCode !== 0) {
        return leftResult;
      }

      const rightResult = await this.execute(node.right, context);
      return normalizeResult({
        stdout: rightResult.stdout,
        stderr: appendText(leftResult.stderr, rightResult.stderr),
        exitCode: rightResult.exitCode,
        control: rightResult.control,
      });
    }
  }

  globalScope.ShellExecutor = ShellExecutor;
})(window);
