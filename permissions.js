(function registerWebLinuxPermissions(globalScope) {
  const users = {
    root: { uid: 0, gid: 0, group: 'root' },
    pass: { uid: 1000, gid: 1000, group: 'pass' },
  };

  let currentUser = 'pass';

  function getCurrentUser(context) {
    if (context && context.isRoot) return 'root';
    if (context && typeof context.user === 'string' && users[context.user]) return context.user;
    if (typeof globalScope.weblinuxSessionUser === 'string' && users[globalScope.weblinuxSessionUser]) {
      return globalScope.weblinuxSessionUser;
    }
    return currentUser;
  }

  function setCurrentUser(user) {
    currentUser = users[user] ? user : 'pass';
    globalScope.weblinuxSessionUser = currentUser;
    return currentUser;
  }

  function isProtectedPath(pathValue) {
    const path = String(pathValue || '');
    return path === '/root' || path.startsWith('/root/') || path === '/etc/shadow';
  }

  function normalizePermissions(node) {
    if (!node || !node.permissions) return '';
    const value = String(node.permissions);
    if (/^[01]?[0-7]{3}$/.test(value)) {
      const digits = value.length === 4 ? value.slice(1) : value;
      const bits = digits.split('').map((digit) => {
        const n = parseInt(digit, 10);
        return `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`;
      }).join('');
      return `${node.type === 'directory' ? 'd' : '-'}${bits}`;
    }
    return value;
  }

  function allowed(node, user, accessType, context) {
    const activeUser = user || getCurrentUser(context);
    if (!node) return false;
    if (activeUser === 'root') return true;
    if (isProtectedPath(node.path)) return false;

    const permissions = normalizePermissions(node);
    if (!permissions || permissions.length < 10) return true;

    const ownerBits = permissions.slice(1, 4);
    const groupBits = permissions.slice(4, 7);
    const otherBits = permissions.slice(7, 10);
    const bits = activeUser === node.owner ? ownerBits : (activeUser === node.group ? groupBits : otherBits);
    const index = accessType === 'read' ? 0 : accessType === 'write' ? 1 : 2;
    const requiredBit = accessType === 'execute' ? 'x' : accessType.charAt(0);
    return bits[index] === requiredBit;
  }

  function canRead(node, user, context) {
    return allowed(node, user, 'read', context);
  }

  function canWrite(node, user, context) {
    return allowed(node, user, 'write', context);
  }

  function canExecute(node, user, context) {
    return allowed(node, user, 'execute', context);
  }

  globalScope.WebLinuxUsers = {
    getCurrentUser,
    setCurrentUser,
  };

  globalScope.WebLinuxPermissions = {
    canRead,
    canWrite,
    canExecute,
    isProtectedPath,
    getCurrentUser,
    setCurrentUser,
  };
})(window);