import test from 'node:test';
import assert from 'node:assert/strict';
import {parseConnection,proxyConfig,MAX_LIFETIME} from '../connection.mjs';
const now=1800000000000;
const valid={kind:'lyco-loopback-proxy',version:1,scheme:'http',host:'127.0.0.1',port:18080,issuedAt:now,expiresAt:now+60000};
test('both desktop protocols share the exact bounded non-secret handoff',()=>{
 for(const scheme of ['http','socks5']){
  const value={...valid,scheme};assert.deepEqual(parseConnection(JSON.stringify(value),now),value);
  assert.equal(proxyConfig(value).rules.singleProxy.scheme,scheme);
 }
});
test('rejects remote destinations, raw subscription secrets, stale codes and unbounded lifetimes',()=>{
 for(const change of [{host:'example.com'},{host:'127.0.0.1.evil.test'},{port:80},{scheme:'vless'},{token:'secret'},
  {expiresAt:now},{issuedAt:now-300001},{expiresAt:now+MAX_LIFETIME+1},{version:2}])
  assert.throws(()=>parseConnection(JSON.stringify({...valid,...change}),now));
 for(const value of ['vless://not-a-code','https://lain42.top/panel/api/sub/secret','null','[]','x'.repeat(2049)])assert.throws(()=>parseConnection(value,now));
});
