'use strict';

// Preserve the checkout's line endings while requiring exactly one anchor
// across LF and CRLF forms. Never silently patch an ambiguous upstream file.
function replaceOne(source, from, to, label = 'source') {
  if (typeof from !== 'string' || !from) throw Error(label + ': empty upstream anchor');
  const normalized = from.replace(/\r\n/g, '\n');
  const variants = [...new Set([normalized, normalized.replace(/\n/g, '\r\n')])];
  const hits = variants.map(needle => ({needle, count: source.split(needle).length - 1}));
  const count = hits.reduce((sum, item) => sum + item.count, 0);
  if (count !== 1) throw Error(label + ': upstream anchor mismatch: ' + from.slice(0, 80) + ' (' + count + ')');
  const needle = hits.find(item => item.count === 1).needle;
  const eol = needle.includes('\r\n') ? '\r\n' : '\n';
  const replacement = to.replace(/\r\n/g, '\n').replace(/\n/g, eol);
  return source.replace(needle, () => replacement);
}
module.exports = {replaceOne};
