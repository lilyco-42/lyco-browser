import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeProfileMetadata,encodeProfileMetadata,routeBinding} from '../apps/universal/src/profile-metadata.mjs';
import {nodeIdentityInput,bindingForNode,assertProfileAccess,assertManualProfile,restoredRouteSelection,selectedMobileNode,assertPaidProfile} from '../apps/universal/src/mobile-route-policy.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Mobile profile verification runs in Actions only');
const id='12abcdef-0123-4567-89ab-0123456789ab';
const profile=()=>({id,name:'Store A',url:'https://example.com/',createdAt:12345});
function node(name='CI route A',extra={}){
 const value={name,outbound:{type:'http',server:'127.0.0.1',server_port:18083,username:'CI_NODE_USER',password:'CI_NODE_SECRET',...extra}};
 return {...value,id:createHash('sha256').update(nodeIdentityInput(value)).digest('hex')};
}
test('legacy profile IDs and website namespaces survive migration and framed metadata refuses old readers',()=>{
 const original=profile(),raw=JSON.stringify([original]);
 const decoded=decodeProfileMetadata(raw,()=>{throw Error('Valid UUID must not regenerate')});
 assert.deepEqual(decoded.profiles,[original]);assert.equal(decoded.migrated,false);
 const bound={...original,route:bindingForNode('owner-a',node())};
 const saved=encodeProfileMetadata([bound]);assert.throws(()=>JSON.parse(saved),SyntaxError);
 assert.deepEqual(decodeProfileMetadata(saved,()=>{throw Error('Do not reset saved IDs')}).profiles,[bound]);
 const upper={...original,id:original.id.toUpperCase()};
 assert.equal(decodeProfileMetadata(JSON.stringify([upper]),()=>{throw Error('Do not reset uppercase UUID')}).profiles[0].id,id);
});
test('metadata persists only owner, route identity and label; node/account secrets never enter it',()=>{
 const route=node(),bound={...profile(),route:bindingForNode('owner-a',route),token:'CI_ACCOUNT_SECRET',outbound:route.outbound};
 const saved=encodeProfileMetadata([bound]);
 assert.doesNotMatch(saved,/CI_NODE_SECRET|CI_NODE_USER|CI_ACCOUNT_SECRET|outbound|127\.0\.0\.1|18083|password/);
 assert.deepEqual(Object.keys(decodeProfileMetadata(saved,()=>id).profiles[0].route).sort(),['owner','routeId','routeName']);
 assert.deepEqual(Object.keys(bindingForNode('owner-a',node(' A\nB '))).sort(),['owner','routeId','routeName']);
 assert.equal(bindingForNode('owner-a',node(' A\nB ')).routeName,'A B');
});
test('malformed, downgraded and duplicated bound metadata is rejected without discarding the binding',()=>{
 const bound={...profile(),route:bindingForNode('owner-a',node())};
 assert.throws(()=>decodeProfileMetadata(JSON.stringify([bound]),()=>id),/拒绝降级/);
 for(const route of [null,{}, {...bound.route,owner:''},{...bound.route,owner:'bad\nowner'},{...bound.route,routeId:'DIRECT'},{...bound.route,password:'secret'}]){
  const raw='LYCO_PROFILE_METADATA:2\n'+JSON.stringify({version:2,profiles:[{...bound,route}]});
  assert.throws(()=>decodeProfileMetadata(raw,()=>id),/绑定记录无效/);
 }
 assert.throws(()=>decodeProfileMetadata('LYCO_PROFILE_METADATA:3\n{}',()=>id));
 assert.throws(()=>decodeProfileMetadata('{"version":99}',()=>id),/版本暂不支持/);
 assert.throws(()=>encodeProfileMetadata([bound,{...bound,id:id.toUpperCase()}]),/重复/);
});
test('migrating a legacy non-UUID allocates one new ID while a v2 invalid ID never silently resets data',()=>{
 const legacy={...profile(),id:'old-profile'};
 const converted=decodeProfileMetadata(JSON.stringify([legacy]),()=>id);
 assert.equal(converted.migrated,true);assert.equal(converted.profiles[0].id,id);
 const raw='LYCO_PROFILE_METADATA:2\n'+JSON.stringify({version:2,profiles:[legacy]});
 assert.throws(()=>decodeProfileMetadata(raw,()=>id),/环境记录无效/);
});
test('route IDs ignore credential rotation and change for a different endpoint or protocol',()=>{
 const a=node();assert.equal(a.id,node('CI route A',{password:'ROTATED',username:'ROTATED'}).id);
 assert.notEqual(a.id,node('CI route A',{server_port:18084}).id);
 assert.notEqual(a.id,node('CI route A',{type:'socks'}).id);
 assert.notEqual(a.id,node('renamed route').id);
 assert.doesNotMatch(nodeIdentityInput(a),/CI_NODE_SECRET|CI_NODE_USER/);
});
test('stored choice and an explicitly selected choice survive refresh; a removed choice never picks another node',()=>{
 const a=node(),b=node('CI route B',{server_port:18084}),bound={...profile(),route:bindingForNode('owner-a',a)};
 assert.equal(restoredRouteSelection(bound),a.id);assert.equal(restoredRouteSelection(bound,b.id),b.id);
 assert.equal(restoredRouteSelection(profile()),'');
 assert.throws(()=>selectedMobileNode({nodes:[b]},a.id),/不会自动换线/);
 assert.equal(selectedMobileNode({nodes:[a,b]},a.id),a);
});
test('cross-account and manual launches cannot reuse a paid-bound website environment',()=>{
 const bound={...profile(),route:bindingForNode('owner-a',node())};
 assert.doesNotThrow(()=>assertProfileAccess(bound,'owner-a'));
 for(const owner of [undefined,'owner-b'])assert.throws(()=>assertProfileAccess(bound,owner),/所属账号/);
 assert.throws(()=>assertManualProfile(bound),/另建环境/);
 assert.doesNotThrow(()=>assertManualProfile(profile()));
 assert.throws(()=>assertManualProfile({...profile(),route:null}),/绑定记录无效/);
});
test('paid launch requires the exact fresh selected catalog node, owner and bounded verification lease',()=>{
 const a=node(),b=node('CI route B',{server_port:18084}),bound={...profile(),route:bindingForNode('owner-a',a)};
 const subscription={owner:'owner-a',verifiedAt:1000000,expiresAt:null,nodes:[a,b]},session={username:'owner-a',token:'CI_ACCOUNT_SECRET'};
 assert.doesNotThrow(()=>assertPaidProfile(bound,subscription,a,session,1000000));
 assert.throws(()=>assertPaidProfile(bound,subscription,b,session,1000000),/所选官网线路已变化/);
 assert.throws(()=>assertPaidProfile(bound,subscription,{...a,outbound:b.outbound},session,1000000),/所选官网线路已变化/);
 assert.throws(()=>assertPaidProfile(bound,subscription,a,{...session,username:'owner-b'},1000000),/所属账号/);
 for(const value of [{...subscription,verifiedAt:1000001},{...subscription,verifiedAt:NaN},{...subscription,expiresAt:1000000}])assert.throws(()=>assertPaidProfile(bound,value,a,session,1000000),/权益核实已过期/);
 assert.throws(()=>assertPaidProfile(bound,subscription,a,session,1300000),/权益核实已过期/);
 assert.throws(()=>routeBinding({...bound.route,routeName:'\n'}),/绑定记录无效/);
});
