/** No credentials or subscription tokens are persisted in environment metadata. */
export function parseProxyEndpoint(value) {
 if(typeof value!=='string'||value.length>2048)throw Error('请输入 HTTP(S) 代理地址');
 let url;
 try {url=new URL(value.trim())} catch {throw Error('代理格式应为 https://主机:端口 或 http://主机:端口')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||
   url.search||url.hash||!['','/'].includes(url.pathname)||
   !/^[A-Za-z0-9.-]{1,253}$/.test(url.hostname))throw Error('当前移动端需要无账号密码的 HTTP(S) 代理，不支持订阅链接');
 const port=Number(url.port||(url.protocol==='https:'?443:80));
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('代理端口无效');
 return {scheme:url.protocol.slice(0,-1),host:url.hostname,port};
}
