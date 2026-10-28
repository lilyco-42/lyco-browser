// Test-owned upstreams. The origin identifies the actual proxy TCP connection,
// not a browser-supplied header or a claimed route in the observation body.
import http from 'node:http';
import net from 'node:net';
import {protectConnectHandler} from './connect-handler.mjs';
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
export async function createWorkspaceRoutingFixture(){
 const connections=new Map(),observations=[],checks=[],pageRequests=[],nodes=[];
 const origin=http.createServer(async(req,res)=>{
  const route=connections.get(req.socket.remotePort)||'direct',url=new URL(req.url,'http://fixture');
  if(url.pathname==='/report'){
   let body='';for await(const chunk of req)body+=chunk;
   observations.push({...JSON.parse(body),route});res.end('ok');return;
  }
  if(url.pathname==='/check'){
   checks.push({key:url.searchParams.get('key'),route});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({route}));return;
  }
  if(url.pathname!=='/page'){res.writeHead(404).end();return;}
  const owner=url.searchParams.get('owner'),phase=url.searchParams.get('phase');
  pageRequests.push({phase,route});
  res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');
  res.end(`<!doctype html><title>LYCO selected route fixture</title><script>(async()=>{
   const readCookie=()=>document.cookie.split('; ').find(s=>s.startsWith('routeOwner='))?.slice(11)||null;
   const before={cookie:readCookie(),local:localStorage.getItem('routeOwner')};
   const owner=${JSON.stringify(owner)},phase=${JSON.stringify(phase)};
   document.cookie='routeOwner='+owner+'; Path=/; Max-Age=600; SameSite=Lax';localStorage.setItem('routeOwner',owner);
   await fetch('/report',{method:'POST',body:JSON.stringify({phase,before,after:{cookie:readCookie(),local:localStorage.getItem('routeOwner')}})});
  })();</script>`);
 });
 const originPort=await listen(origin),originUrl=`http://127.0.0.1:${originPort}`;
 const geo=http.createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'success',query:'198.51.100.20',countryCode:'US',timezone:'Etc/UTC',lat:0,lon:0}))});
 const geoPort=await listen(geo);
 for(const route of ['A','B']){
  const sockets=new Set(),password='CI_PRIVATE_ROUTE_'+route,username='CI_ROUTE_'+route;
  const expected='Basic '+Buffer.from(username+':'+password).toString('base64');
  const mark=socket=>{const port=socket.localPort;connections.set(port,route);socket.once('close',()=>connections.delete(port))};
  const proxy=http.createServer((req,res)=>{
   if(req.headers['proxy-authorization']!==expected){res.writeHead(407).end();return;}
   const url=new URL(req.url);
   if(url.hostname!=='127.0.0.1'||Number(url.port)!==originPort){res.writeHead(502).end();return;}
   const upstream=http.request({host:'127.0.0.1',port:originPort,path:url.pathname+url.search,method:req.method,headers:{...req.headers,host:`127.0.0.1:${originPort}`}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res)});
   upstream.on('socket',socket=>{sockets.add(socket);socket.once('connect',()=>mark(socket));socket.once('close',()=>sockets.delete(socket))});
   upstream.on('error',()=>res.destroy());req.pipe(upstream);
  });
  proxy.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket))});
  proxy.on('connect',protectConnectHandler((req,socket,head)=>{
   if(req.headers['proxy-authorization']!==expected){socket.end('HTTP/1.1 407 Authentication required\r\n\r\n');return;}
   const port=req.url===`127.0.0.1:${originPort}`?originPort:req.url==='ip-api.com:80'?geoPort:null;
   if(!port){socket.end('HTTP/1.1 502 CI fixture only\r\n\r\n');return;}
   const upstream=net.connect({host:'127.0.0.1',port});sockets.add(upstream);
   upstream.once('connect',()=>{mark(upstream);socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket)});
   socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());upstream.once('close',()=>sockets.delete(upstream));
  }));
  const port=await listen(proxy);nodes.push({route,proxy,sockets,port,username,password,stopped:false});
 }
 async function stopNode(route){
  const node=nodes.find(row=>row.route===route);if(!node||node.stopped)return;
  node.stopped=true;for(const socket of node.sockets)socket.destroy();await new Promise(resolve=>node.proxy.close(resolve));
 }
 return {originUrl,observations,checks,pageRequests,
  subscription:{proxies:nodes.map(node=>({name:'CI route '+node.route,type:'http',server:'127.0.0.1',port:node.port,username:node.username,password:node.password})),
   'proxy-groups':[{name:'PROXY',type:'select',proxies:['CI route A','CI route B']}]},stopNode,
  async close(){await Promise.all(nodes.map(node=>stopNode(node.route)));origin.closeAllConnections();geo.closeAllConnections();await Promise.all([new Promise(resolve=>origin.close(resolve)),new Promise(resolve=>geo.close(resolve))])},
 };
}
