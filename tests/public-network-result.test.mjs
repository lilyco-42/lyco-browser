import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPublicPage, classifyPublicCell} from './public-network-result.mjs';

test('HTTP errors and challenges never count as a completed public diagnostic', () => {
  assert.equal(classifyPublicPage({status: 403, title: 'IP 查询'}), 'http-error');
  assert.equal(classifyPublicPage({status: 200, title: 'Just a moment...'}), 'site-challenge');
  assert.equal(classifyPublicPage({status: null}), 'unavailable');
  assert.equal(classifyPublicPage({status: 200, origin: 'https://example.com'}), 'unexpected-origin');
  assert.equal(classifyPublicPage({status: 200, title: 'Claude AI IP 检测'}), 'observed');
});

test('missing or inconclusive DNS/UDP observations do not become no-leak verdicts', () => {
  for (const text of ['', '获取失败', 'DNS加密或未暴露出口', '检测中', '未知']) assert.equal(classifyPublicCell(text), 'unknown');
  assert.equal(classifyPublicCell('WebRTC已禁用或无泄露'), 'blocked-or-unsupported');
  assert.equal(classifyPublicCell('时区不一致'), 'warning');
  assert.equal(classifyPublicCell('检测到泄露'), 'warning');
  assert.equal(classifyPublicCell('未检测到泄露'), 'reported');
  assert.equal(classifyPublicCell('时区一致 UTC'), 'reported');
});
