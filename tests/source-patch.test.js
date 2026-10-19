'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {replaceOne} = require('../scripts/source-patch');

test('exact multiline patches preserve LF and Windows CRLF without changing other bytes', () => {
  for (const eol of ['\n', '\r\n']) {
    const source = ['prefix', 'begin', '  old', 'end', 'suffix'].join(eol);
    assert.equal(replaceOne(source, 'begin\n  old\nend', 'begin\n  new\nend'),
      ['prefix', 'begin', '  new', 'end', 'suffix'].join(eol));
  }
});

test('missing and ambiguous anchors fail, including mixed newline forms', () => {
  assert.throws(() => replaceOne('different', 'begin\nend', 'new'), /\(0\)/);
  assert.throws(() => replaceOne('begin\nend\nbegin\nend', 'begin\nend', 'new'), /\(2\)/);
  assert.throws(() => replaceOne('begin\nend\nbegin\r\nend', 'begin\nend', 'new'), /\(2\)/);
  assert.throws(() => replaceOne('text', '', 'new'), /empty/);
});

test('single-line replacement remains literal, including dollar replacement tokens', () => {
  assert.equal(replaceOne('prefix old suffix', 'old', '$& $$'), 'prefix $& $$ suffix');
});
