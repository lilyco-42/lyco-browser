import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProxyEndpoint} from '../apps/universal/src/proxy-endpoint.mjs';
test('mobile route rejects credentials, subscription tokens, paths and non-proxy protocols',()=>{
 for(const value of ['',null,'socks5://exit.example:1080','file:///tmp/a','https://user:secret@exit.example:443','https://lain42.top/panel/api/sub/private-token','http://exit.example/?token=private','https://exit.example/#token','http://exit.example:0','http://exit.example:65536'])assert.throws(()=>parseProxyEndpoint(value));
});
test('route parser preserves explicit remote HTTP and TLS proxy endpoints',()=>{
 assert.deepEqual(parseProxyEndpoint('https://exit.example:8443'),{scheme:'https',host:'exit.example',port:8443});
 assert.deepEqual(parseProxyEndpoint('http://127.0.0.1:18888'),{scheme:'http',host:'127.0.0.1',port:18888});
 assert.equal(parseProxyEndpoint('https://exit.example').port,443);
});
