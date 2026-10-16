export const MAX_LIFETIME=8*60*60*1000;
export function parseConnection(input,now=Date.now()) {
 if(typeof input!=='string'||input.length>2048)throw Error('请粘贴桌面客户端复制的连接码');
 let value;try{value=JSON.parse(input)}catch{throw Error('连接码格式不正确，请重新复制')}
 const allowed=['kind','version','scheme','host','port','issuedAt','expiresAt'];
 if(!value||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key))||value.kind!=='lyco-loopback-proxy'||value.version!==1||!['http','socks5'].includes(value.scheme)||value.host!=='127.0.0.1'||!Number.isInteger(value.port)||value.port<1024||value.port>65535)
  throw Error('仅接受 LYCO 客户端的本机 HTTP / SOCKS5 连接码');
 if(!Number.isSafeInteger(value.issuedAt)||!Number.isSafeInteger(value.expiresAt)||value.issuedAt>now+60_000||now-value.issuedAt>5*60_000||value.expiresAt<=now||value.expiresAt-value.issuedAt>MAX_LIFETIME||value.expiresAt<=value.issuedAt)
  throw Error('连接码已过期或时间无效，请在客户端重新复制');
 return value;
}
export function proxyConfig(connection) {
 return {mode:'fixed_servers',rules:{singleProxy:{scheme:connection.scheme,host:'127.0.0.1',port:connection.port},bypassList:['localhost','127.0.0.1','[::1]']}};
}
export const BLOCKED={mode:'fixed_servers',rules:{singleProxy:{scheme:'http',host:'127.0.0.1',port:9},bypassList:['localhost','127.0.0.1','[::1]']}};
