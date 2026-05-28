"use strict";

(function registerShellRuntime(globalScope) {
  const tokenizer = globalScope.ShellTokenizer;
  const parser = globalScope.ShellParser;
  const ExecutorClass = globalScope.ShellExecutor;

  if (!tokenizer || !parser || !ExecutorClass) {
    throw new Error("Shell runtime dependencies are missing");
  }

  function appendText(base, extra) {
    if (!extra) return base;
    if (!base) return extra;
    return `${base}\n${extra}`;
  }

  class ShellRuntime {
    constructor(options) {
      const opts = options || {};
      this.executor = new ExecutorClass({ commandRuntime: opts.commandRuntime });
    }

    async run(input, context) {
      const rawSource = String(input || "");
      // Expand shell variables first
      const expandedSource = context && typeof context.expandInput === 'function'
        ? String(context.expandInput(rawSource) || "")
        : rawSource;

      // Alias expansion: perform simple, pre-tokenization alias substitution for the first word.
      let aliasExpanded = expandedSource;
      try {
        const aliases = context && context.terminalState && context.terminalState.aliases ? context.terminalState.aliases : null;
        if (aliases) {
          const parts = String(expandedSource).trim().split(/\s+/);
          const first = parts[0];
          if (first && typeof aliases[first] === 'string') {
            aliasExpanded = aliases[first] + (parts.length > 1 ? ' ' + parts.slice(1).join(' ') : '');
          }
        }
      } catch (e) {
        // Fail silently on alias expansion errors to avoid breaking the shell
      }

      const source = String(aliasExpanded || '').trim();
      if (!source) {
        return { stdout: "", stderr: "", exitCode: 0, control: "" };
      }

      try {
        const tokens = tokenizer.tokenize(source);
        const chunks = parser.splitBySemicolon(tokens);

        let merged = { stdout: "", stderr: "", exitCode: 0, control: "" };

        for (const chunk of chunks) {
          if (!chunk.length) continue;

          const ast = parser.parse(chunk);
          const result = await this.executor.execute(ast, context);

          merged.stdout = appendText(merged.stdout, result.stdout);
          merged.stderr = appendText(merged.stderr, result.stderr);
          merged.exitCode = result.exitCode;
          if (result.control) merged.control = result.control;
        }

        return merged;
      } catch (error) {
        return {
          stdout: "",
          stderr: error && error.message ? error.message : "shell: parse error",
          exitCode: 2,
          control: "",
        };
      }
    }
  }

  globalScope.ShellRuntime = ShellRuntime;
})(window);
