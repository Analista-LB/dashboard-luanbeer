(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.Sanitizer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/[&<>"']/g, ch => HTML_ESCAPE_MAP[ch]);
  }

  function cleanControlChars(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[\u0000-\u001F]/g, '').trim();
  }

  function sanitizeCellString(value) {
    if (value === null || value === undefined) return '';
    let s = cleanControlChars(value);
    // Neutralize potential spreadsheet formula injection or script tags
    if (/^[=+\-@]/.test(s) && !/^-[0-9.,]+$/.test(s)) {
      s = "'" + s;
    }
    s = s.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '[SCRIPT_BLOQUEADO]');
    s = s.replace(/javascript\s*:/gi, '[JS_BLOQUEADO]:');
    s = s.replace(/on\w+\s*=/gi, '[EVENTO_BLOQUEADO]=');
    return s;
  }

  function sanitizeFileName(name) {
    if (!name) return 'archivo_sin_nombre';
    return cleanControlChars(name).replace(/[<>:"/\\|?*]/g, '_');
  }

  return {
    escapeHtml,
    cleanControlChars,
    sanitizeCellString,
    sanitizeFileName
  };
});
