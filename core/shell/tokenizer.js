"use strict";

(function registerShellTokenizer(globalScope) {
  const TOKEN_TYPES = {
    WORD: "WORD",
    STRING: "STRING",
    PIPE: "PIPE",
    OR: "OR",
    REDIRECT_OUT: "REDIRECT_OUT",
    REDIRECT_APPEND: "REDIRECT_APPEND",
    AND: "AND",
    SEMICOLON: "SEMICOLON",
  };

  function isWhitespace(char) {
    return char === " " || char === "\t" || char === "\n" || char === "\r";
  }

  function isOperatorStart(char) {
    return char === "|" || char === ">" || char === "&" || char === ";";
  }

  function tokenize(input) {
    const source = String(input || "");
    const tokens = [];
    let index = 0;

    function pushToken(type, value) {
      if (value === undefined) tokens.push({ type });
      else tokens.push({ type, value });
    }

    function readQuotedString(quoteChar) {
      let value = "";
      index += 1;

      while (index < source.length) {
        const char = source[index];

        if (char === "\\") {
          const next = source[index + 1];
          if (next === undefined) {
            value += "\\";
            index += 1;
            continue;
          }
          value += next;
          index += 2;
          continue;
        }

        if (char === quoteChar) {
          index += 1;
          return value;
        }

        value += char;
        index += 1;
      }

      throw new Error("shell: unterminated string literal");
    }

    function readWord() {
      let value = "";

      while (index < source.length) {
        const char = source[index];

        if (char === "\\") {
          const next = source[index + 1];
          if (next !== undefined) {
            value += next;
            index += 2;
            continue;
          }
        }

        if (isWhitespace(char) || isOperatorStart(char) || char === "\"" || char === "'") {
          break;
        }

        value += char;
        index += 1;
      }

      return value;
    }

    while (index < source.length) {
      const char = source[index];

      if (isWhitespace(char)) {
        index += 1;
        continue;
      }

      if (char === "\"") {
        pushToken(TOKEN_TYPES.STRING, readQuotedString("\""));
        continue;
      }

      if (char === "'") {
        pushToken(TOKEN_TYPES.STRING, readQuotedString("'"));
        continue;
      }

      // Longest operator match first so multi-character operators do not split.
      if (char === "|" && source[index + 1] === "|") {
        pushToken(TOKEN_TYPES.OR);
        index += 2;
        continue;
      }

      if (char === "&" && source[index + 1] === "&") {
        pushToken(TOKEN_TYPES.AND);
        index += 2;
        continue;
      }

      if (char === ">" && source[index + 1] === ">") {
        pushToken(TOKEN_TYPES.REDIRECT_APPEND);
        index += 2;
        continue;
      }

      if (char === ">") {
        pushToken(TOKEN_TYPES.REDIRECT_OUT);
        index += 1;
        continue;
      }

      if (char === "|") {
        pushToken(TOKEN_TYPES.PIPE);
        index += 1;
        continue;
      }

      if (char === ";") {
        pushToken(TOKEN_TYPES.SEMICOLON);
        index += 1;
        continue;
      }

      const word = readWord();
      if (word) {
        pushToken(TOKEN_TYPES.WORD, word);
        continue;
      }

      throw new Error(`shell: unexpected token '${char}'`);
    }

    return tokens;
  }

  globalScope.ShellTokenizer = {
    TOKEN_TYPES,
    tokenize,
  };
})(window);
