import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileOutbound,mobileNodes} from '../apps/universal/src/subscription.mjs';
const base={name:'Paid node',server:'127.0.0.1',port:18081};
const uuid='01234567-89ab-4def-8123-456789abcdef';
test('mobile outbound adapters preserve node credentials and explicit safe TLS/transport settings',()=>{
 assert.deepEqual(mobileOutbound({...base,type:'ss',cipher:'aes-128-gcm',password:'CI-only'}),{type:'shadowsocks',server:'127.0.0.1',server_port:18081,method:'aes-128-gcm',password:'CI-only'});
 const vless=mobileOutbound({...base,type:'vless',uuid,tls:true,servername:'edge.example',network:'ws','ws-opts':{path:'/stream',headers:{Host:'edge.example'}}});
 assert.equal(vless.tls.server_name,'edge.example');assert.equal(vless.transport.path,'/stream');assert.equal(vless.uuid,uuid);
 for(const type of ['vmess','trojan','hysteria2','tuic','http','socks5'])assert.ok(mobileOutbound({...base,type,uuid,cipher:'auto',password:'CI-only'}));
});
test('mobile adapters reject unsafe certificate policy, hidden dialers and unsupported node settings',()=>{
 for(const extra of [{'skip-cert-verify':true},{'dialer-proxy':'DIRECT'},{plugin:'unknown'},{ports:'1000-2000'},{network:'unknown'},{uuid:'not-a-uuid'}])assert.throws(()=>mobileOutbound({...base,type:'vless',uuid,...extra}));
 assert.throws(()=>mobileOutbound({...base,type:'direct'}));
 assert.throws(()=>mobileOutbound({...base,type:'http',username:'only-user'}));
});
test('subscription traverses the declared PROXY graph without importing listeners, rules or direct fallbacks',()=>{
 const subscription={proxies:[{...base,type:'http'},{...base,name:'not selected',type:'http'}],'proxy-groups':[{name:'PROXY',proxies:['DIRECT','AUTO']},{name:'AUTO',proxies:['Paid node']}],rules:['MATCH,DIRECT'],'mixed-port':9876};
 const result=mobileNodes(subscription);assert.equal(result.nodes.length,1);assert.equal(result.nodes[0].name,'Paid node');
 assert.equal(result.nodes[0].outbound['mixed-port'],undefined);assert.equal(result.nodes[0].outbound.rules,undefined);
 subscription['proxy-groups'][1].proxies=['PROXY'];assert.throws(()=>mobileNodes(subscription),/循环/);
});
test('a direct-only or unknown subscription cannot claim a mobile connection',()=>{
 for(const proxies of [['DIRECT'],['unknown']])assert.throws(()=>mobileNodes({proxies:[], 'proxy-groups':[{name:'PROXY',proxies}]}));
});
