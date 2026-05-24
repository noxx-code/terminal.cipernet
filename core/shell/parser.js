"use strict";

(function registerShellParser(globalScope) {
  const tokenizer = globalScope.ShellTokenizer;
  const shellAst = globalScope.ShellAst || {};

  if (!tokenizer) {
    throw new Error("ShellTokenizer must be loaded before ShellParser");
  }

  const { TOKEN_TYPES } = tokenizer;
  const { CommandNode, PipeNode, RedirectNode, AndNode } = shellAst;

  if (!CommandNode || !PipeNode || !RedirectNode || !AndNode) {
    throw new Error("Shell AST node classes must be loaded before ShellParser");
  }

  class TokenStream {
    constructor(tokens) {
      this.tokens = tokens;
      this.index = 0;
    }

    peek() {
      return this.tokens[this.index] || null;
    }

    next() {
      const token = this.tokens[this.index] || null;
      if (token) this.index += 1;
      return token;
    }

    match(type) {
      const token = this.peek();
      if (token && token.type === type) {
        this.index += 1;
        return token;
      }
      return null;
    }

    expect(type, message) {
      const token = this.next();
      if (!token || token.type !== type) {
        throw new Error(message);
      }
      return token;
    }

    eof() {
      return this.index >= this.tokens.length;
    }
  }

  function tokenToSymbol(token) {
    if (!token) return "newline";
    switch (token.type) {
      case TOKEN_TYPES.PIPE:
        return "|";
      case TOKEN_TYPES.OR:
        return "||";
      case TOKEN_TYPES.AND:
        return "&&";
      case TOKEN_TYPES.REDIRECT_OUT:
        return ">";
      case TOKEN_TYPES.REDIRECT_APPEND:
        return ">>";
      case TOKEN_TYPES.SEMICOLON:
        return ";";
      case TOKEN_TYPES.WORD:
      case TOKEN_TYPES.STRING:
        return token.value;
      default:
        return token.type;
    }
  }

  function syntaxErrorUnexpected(token) {
    return new Error(`syntax error near unexpected token '${tokenToSymbol(token)}'`);
  }

  // Parser precedence (high -> low):
  // 1) simple command + redirects
  // 2) pipe |
  // 3) logical and &&
  function parse(tokens) {
    const stream = new TokenStream(tokens || []);

    if (stream.eof()) {
      throw new Error("shell: empty command");
    }

    const ast = parseAnd(stream);

    if (!stream.eof()) {
      const next = stream.peek();
      if (next && next.type === TOKEN_TYPES.OR) {
        throw new Error("unsupported operator ||");
      }
      throw syntaxErrorUnexpected(next);
    }

    return ast;
  }

  function parseAnd(stream) {
    let node = parsePipe(stream);

    while (stream.match(TOKEN_TYPES.AND)) {
      const right = parsePipe(stream);
      node = new AndNode(node, right);
    }

    return node;
  }

  function parsePipe(stream) {
    let node = parseRedirect(stream);

    while (stream.match(TOKEN_TYPES.PIPE)) {
      if (stream.eof()) {
        throw syntaxErrorUnexpected({ type: TOKEN_TYPES.PIPE });
      }
      const right = parseRedirect(stream);
      node = new PipeNode(node, right);
    }

    return node;
  }

  function parseRedirect(stream) {
    let node = parseCommand(stream);

    while (true) {
      const redirectOut = stream.match(TOKEN_TYPES.REDIRECT_OUT);
      const redirectAppend = stream.match(TOKEN_TYPES.REDIRECT_APPEND);

      if (!redirectOut && !redirectAppend) break;

      const mode = redirectAppend ? ">>" : ">";
      const targetToken = stream.next();

      if (!targetToken || (targetToken.type !== TOKEN_TYPES.WORD && targetToken.type !== TOKEN_TYPES.STRING)) {
        throw syntaxErrorUnexpected(targetToken);
      }

      node = new RedirectNode(node, mode, targetToken.value);
    }

    return node;
  }

  function parseCommand(stream) {
    const token = stream.next();

    if (!token || (token.type !== TOKEN_TYPES.WORD && token.type !== TOKEN_TYPES.STRING)) {
      throw syntaxErrorUnexpected(token);
    }

    const name = token.value;
    const args = [];

    while (true) {
      const next = stream.peek();
      if (!next) break;
      if (next.type !== TOKEN_TYPES.WORD && next.type !== TOKEN_TYPES.STRING) break;
      args.push(stream.next().value);
    }

    return new CommandNode(name, args);
  }

  // Semicolons split the input into independent command programs.
  function splitBySemicolon(tokens) {
    const chunks = [];
    let current = [];

    for (const token of tokens || []) {
      if (token.type === TOKEN_TYPES.SEMICOLON) {
        chunks.push(current);
        current = [];
        continue;
      }
      current.push(token);
    }

    chunks.push(current);
    return chunks;
  }

  globalScope.ShellParser = {
    parse,
    splitBySemicolon,
  };
})(window);
