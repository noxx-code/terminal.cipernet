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
    const browser = globalScope.navigator ? globalScope.navigator.userAgent : 'browser';
    return [
      'Linux version 6.8.0-browser-vfs (builder@terminal.cipernet) #1 SMP PREEMPT_DYNAMIC',
      `Built for browser runtime at ${now()}`,
      `User agent: ${browser}`,
    ].join('\n');
  }

  function buildProcMeminfo() {
    const nav = globalScope.navigator || {};
    const perf = globalScope.performance || {};
    const deviceMemoryGb = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 4;
    const totalBytes = Math.max(256 * 1024 * 1024, Math.floor(deviceMemoryGb * 1024 * 1024 * 1024));
    const usedBytes = perf.memory && typeof perf.memory.usedJSHeapSize === 'number'
      ? perf.memory.usedJSHeapSize
      : Math.floor(totalBytes * 0.28);
    const freeBytes = Math.max(0, totalBytes - usedBytes);
    const availableBytes = Math.max(freeBytes, Math.floor(totalBytes * 0.6));

    return [
      `MemTotal:       ${formatBytes(Math.floor(totalBytes / 1024))}`,
      `MemFree:        ${formatBytes(Math.floor(freeBytes / 1024))}`,
      `MemAvailable:   ${formatBytes(Math.floor(availableBytes / 1024))}`,
      `Buffers:        ${formatBytes(Math.floor(totalBytes * 0.03 / 1024))}`,
      `Cached:         ${formatBytes(Math.floor(totalBytes * 0.12 / 1024))}`,
      'SwapTotal:      0 kB',
      'SwapFree:       0 kB',
    ].join('\n');
  }

  function buildProcCpuinfo() {
    const nav = globalScope.navigator || {};
    const cores = Math.max(1, Math.min(32, nav.hardwareConcurrency || 4));
    const lines = [];

    for (let index = 0; index < cores; index++) {
      lines.push(`processor\t: ${index}`);
      lines.push('vendor_id\t: GenuineIntel');
      lines.push('cpu family\t: 6');
      lines.push('model\t\t: 143');
      lines.push('model name\t: Browser Virtual CPU');
      lines.push('stepping\t: 10');
      lines.push('microcode\t: 0x1');
      lines.push('cpu MHz\t\t: 2400.000');
      lines.push('cache size\t: 8192 KB');
      lines.push('physical id\t: 0');
      lines.push('siblings\t: ' + cores);
      lines.push('core id\t\t: ' + index);
      lines.push('cpu cores\t: ' + cores);
      lines.push('flags\t\t: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr');
      lines.push('');
    }

    return lines.join('\n').trim();
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
