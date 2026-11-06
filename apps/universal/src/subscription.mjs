// Convert individual explicit Mihomo nodes into the mobile core's single
// outbound format. Feed rules, providers, listeners and DIRECT never enter it.
const SUPPORTED=new Set(['http','socks5','ss','vmess','vless','trojan','hysteria2','tuic']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(){throw Error('该线路的协议或安全设置暂不支持移动端')}
function text(value,max=4096){if(typeof value!=='string'||!value||value.length>max)fail();return value}
function port(value){if(!Number.isInteger(value)||value<1||value>65535)fail();return value}
function host(value){text(value,253);if(!/^[A-Za-z0-9.:-]+$/.test(value))fail();return value}
function tls(node,required=false){
 if(node['skip-cert-verify'])fail();
 const enabled=required||node.tls===true||Boolean(node['reality-opts']);
 if(!enabled)return undefined;
 const result={enabled:true,server_name:node.servername||node.sni||node.server};
 host(result.server_name);
 if(node.alpn!==undefined){if(!Array.isArray(node.alpn)||node.alpn.length>10)fail();result.alpn=node.alpn.map(x=>text(x,32))}
 if(node['client-fingerprint']){
  if(!['chrome','firefox','safari','ios','android','edge','random','randomized'].includes(node['client-fingerprint']))fail();
  result.utls={enabled:true,fingerprint:node['client-fingerprint']};
 }
 if(node['reality-opts']){
  const reality=node['reality-opts'];
  if(!/^[A-Za-z0-9_-]{43}$/.test(reality['public-key']||'')||! /^(?:[0-9a-f]{2}){0,8}$/i.test(reality['short-id']||''))fail();
  result.reality={enabled:true,public_key:reality['public-key'],short_id:reality['short-id']||''};
  result.utls||={enabled:true,fingerprint:'chrome'};
 }
 return result;
}
function transport(node){
 if(!node.network||node.network==='tcp')return undefined;
 if(node.network==='ws'){
  const options=node['ws-opts']||{},result={type:'ws',path:options.path||'/'};
  text(result.path,2048);
  if(options.headers){
   if(typeof options.headers!=='object'||Array.isArray(options.headers)||Object.keys(options.headers).length>20)fail();
   result.headers={};for(const [key,value] of Object.entries(options.headers)){
    if(!/^[A-Za-z0-9-]{1,64}$/.test(key)||typeof value!=='string'||/[\r\n]/.test(value)||value.length>4096)fail();
    result.headers[key]=value;
   }
  }
  return result;
 }
 if(node.network==='grpc')return {type:'grpc',service_name:text(node['grpc-opts']?.['grpc-service-name'],256)};
 fail();
}
export function mobileOutbound(node){
 if(!node||typeof node!=='object'||!SUPPORTED.has(node.type))fail();
 if(node['dialer-proxy']||node.plugin||node['plugin-opts']||node.ports||node['port-hopping'])fail();
 const result={type:node.type,server:host(node.server),server_port:port(node.port)};
 if(node.type==='http'||node.type==='socks5'){
  result.type=node.type==='socks5'?'socks':'http';
  if(node.type==='socks5')result.version='5';
  if(node.username!==undefined||node.password!==undefined){result.username=text(node.username,256);result.password=text(node.password,4096)}
  if(node.type==='http'&&tls(node))result.tls=tls(node);
 }else if(node.type==='ss'){
  result.type='shadowsocks';result.method=text(node.cipher,80);result.password=text(node.password);
 }else if(node.type==='vmess'||node.type==='vless'){
  if(!UUID.test(node.uuid||''))fail();result.uuid=node.uuid;
  if(node.type==='vmess'){
   result.security=node.cipher||'auto';text(result.security,32);
   if(node.alterId!==undefined){if(!Number.isInteger(node.alterId)||node.alterId<0||node.alterId>65535)fail();result.alter_id=node.alterId}
  }else if(node.flow){if(node.flow!=='xtls-rprx-vision')fail();result.flow=node.flow}
  const secure=tls(node);if(secure)result.tls=secure;
  const stream=transport(node);if(stream)result.transport=stream;
 }else{
  result.password=text(node.password||node.auth);
  result.tls=tls(node,true);
  if(node.type==='trojan'){
   const stream=transport(node);if(stream)result.transport=stream;
  }else if(node.type==='hysteria2'){
   if(node.obfs){if(node.obfs!=='salamander')fail();result.obfs={type:'salamander',password:text(node['obfs-password'])}}
  }else if(node.type==='tuic'){
   if(!UUID.test(node.uuid||''))fail();result.uuid=node.uuid;
   if(node['congestion-controller']){
    if(!['bbr','cubic','new_reno'].includes(node['congestion-controller']))fail();
    result.congestion_control=node['congestion-controller'];
   }
  }
 }
 return result;
}
export function mobileNodes(subscription){
 const data=typeof subscription==='string'?JSON.parse(subscription):subscription;
 if(!data||!Array.isArray(data.proxies)||data.proxies.length>2000||!Array.isArray(data['proxy-groups']))throw Error('官网订阅格式无效');
 const nodes=new Map(),groups=new Map();
 for(const node of data.proxies){if(!node||typeof node.name!=='string'||nodes.has(node.name)||node.name.length>120)throw Error('订阅线路名称无效');nodes.set(node.name,node)}
 for(const group of data['proxy-groups']){if(!group||typeof group.name!=='string'||groups.has(group.name)||nodes.has(group.name)||!Array.isArray(group.proxies)||group.use?.length||group['include-all']||group['include-all-proxies']||group['include-all-providers'])throw Error('订阅分组暂不支持移动端');groups.set(group.name,group)}
 if(!groups.has('PROXY'))throw Error('订阅缺少 PROXY 分组');
 const selected=new Set();
 function visit(name,stack=new Set()){
  if(['DIRECT','COMPATIBLE','PASS','PASS-RULE','REJECT','REJECT-DROP'].includes(String(name).toUpperCase()))return;
  if(nodes.has(name)){selected.add(name);return}
  const group=groups.get(name);if(!group||stack.has(name)||stack.size>30)throw Error('订阅存在未知线路或循环分组');
  const next=new Set(stack);next.add(name);for(const child of group.proxies)visit(child,next);
 }
 visit('PROXY');
 const supported=[];let unavailable=0;
 for(const name of selected){try{supported.push({name,outbound:mobileOutbound(nodes.get(name))})}catch{unavailable++}}
 if(!supported.length)throw Error('当前订阅没有移动端可用线路，请刷新订阅或联系线路提供者');
 return {nodes:supported,unavailable};
}
