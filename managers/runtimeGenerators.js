(function registerRuntimeGenerators(globalScope) {
  function now() {
    return new Date().toISOString();
  }

  function formatBytes(bytes) {
    return `${Math.max(0, Math.floor(bytes))} kB`;
  }

  function getCrypto() {
    return globalScope.crypto || globalScope.msCrypto || null;
  }

  function randomHex(byteLength = 64) {
    const cryptoImpl = getCrypto();
    const bytes = new Uint8Array(byteLength);

    if (cryptoImpl && typeof cryptoImpl.getRandomValues === 'function') {
      cryptoImpl.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index++) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function buildProcVersion() {
    return 'WEBLINUX Kernel 1.0.0';
  }

  function buildProcMeminfo() {
    const perf = globalScope.performance || {};
    const usedMb = perf.memory && typeof perf.memory.usedJSHeapSize === 'number'
      ? Math.max(256, Math.floor(perf.memory.usedJSHeapSize / (1024 * 1024)))
      : 1024;
    const totalMb = 4096;
    const freeMb = Math.max(0, totalMb - usedMb);
    const availableMb = Math.max(freeMb, 2048);

    return [
      'MemTotal: 4096 MB',
      `MemFree: ${freeMb} MB`,
      `MemAvailable: ${availableMb} MB`,
      'Buffers: 128 MB',
      'Cached: 512 MB',
    ].join('\n');
  }

  function buildProcCpuinfo() {
    return [
      'processor : 0',
      'model name : WEBLINUX Virtual CPU',
      'cpu cores : 1',
      'flags : fpu vme de pse tsc msr pae mce cx8 apic sep mtrr',
    ].join('\n');
  }

  function buildProcUptime(context) {
    const startedAt = context && context.state && typeof context.state.runtimeStartedAt === 'number'
      ? context.state.runtimeStartedAt
      : Date.now();
    const uptime = Math.max(0, (Date.now() - startedAt) / 1000).toFixed(2);
    return `${uptime} ${uptime}`;
  }

  const generators = {
    'proc.version': {
      read: () => buildProcVersion(),
      write: () => false,
      readOnly: true,
    },
    'proc.meminfo': {
      read: () => buildProcMeminfo(),
      write: () => false,
      readOnly: true,
    },
    'proc.cpuinfo': {
      read: () => buildProcCpuinfo(),
      write: () => false,
      readOnly: true,
    },
    'proc.uptime': {
      read: (context) => buildProcUptime(context),
      write: () => false,
      readOnly: true,
    },
    'device.null': {
      read: () => '',
      write: () => true,
      readOnly: false,
    },
    'device.random': {
      read: () => randomHex(64),
      write: () => true,
      readOnly: false,
    },
    'device.tty': {
      read: (context) => context && context.vfs ? context.vfs.getDeviceBuffer('tty') : '',
      write: (context, value) => {
        if (!context || !context.vfs) return true;
        context.vfs.appendDeviceBuffer('tty', value);
        return true;
      },
      readOnly: false,
    },
  };

  function get(key) {
    return generators[key] || null;
  }

  function has(key) {
    return !!generators[key];
  }

  function list() {
    return Object.keys(generators);
  }

  globalScope.RuntimeGenerators = {
    get,
    has,
    list,
  };
})(window);
