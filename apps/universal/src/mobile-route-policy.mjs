import {routeBinding} from './profile-metadata.mjs';
export function nodeIdentityInput(node){
 const value=node?.outbound;
 if(typeof node?.name!=='string'||!node.name||node.name.length>120||typeof value?.type!=='string'||
  typeof value.server!=='string'||!value.server||!Number.isInteger(value.server_port)||value.server_port<1||value.server_port>65535)throw Error('官网线路标识无效');
 return JSON.stringify([node.name,value.type,value.server,value.server_port]);
}
export function bindingForNode(owner,node){
 const name=typeof node?.name==='string'?node.name.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120):'';
 return routeBinding({owner,routeId:node?.id,routeName:name||'已选线路'});
}
export function assertProfileAccess(profile,owner){
 if(profile.route===undefined)return;
 const binding=routeBinding(profile.route);
 if(binding.owner!==owner)throw Error('此环境已绑定其他网站账号，请登录所属账号');
}
export function assertManualProfile(profile){
 if(profile.route!==undefined){routeBinding(profile.route);throw Error('此环境已绑定官网线路，请通过所属账号启动；使用自备代理请另建环境')}
}
export function restoredRouteSelection(profile,current=''){
 return current||profile.route?.routeId||'';
}
export function selectedMobileNode(subscription,id){
 const node=subscription.nodes.find(row=>row.id===id);
 if(!node)throw Error('已选官网线路已不存在或暂不支持，请重新选择；不会自动换线');
 return node;
}
export function assertPaidProfile(profile,subscription,node,session,now=Date.now()){
 assertProfileAccess(profile,session?.username);
 const binding=routeBinding(profile.route);
 if(!session?.token||subscription.owner!==session.username||binding.owner!==subscription.owner||binding.routeId!==node?.id||
  selectedMobileNode(subscription,binding.routeId)!==node)throw Error('环境所属账号或所选官网线路已变化，请重新操作');
 if(!Number.isFinite(subscription.verifiedAt)||subscription.verifiedAt>now||now-subscription.verifiedAt>=300000||
  (subscription.expiresAt!==null&&(!Number.isFinite(subscription.expiresAt)||subscription.expiresAt<=now)))throw Error('权益核实已过期，请重新加载官网线路');
}
