// Test-owned upstreams. The origin identifies the actual proxy TCP connection,
// not a browser-supplied header or a claimed route in the observation body.
import http from 'node:http';
import net from 'node:net';
import {protectConnectHandler} from './connect-handler.mjs';
const listen=(server,port=0)=>new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve(server.address().port)));
export async function createWorkspaceRoutingFixture({chainedA=false,browserOriginHost='127.0.0.1',indexedDB=false,visibleStatus=false}={}){
 if(!['127.0.0.1','10.0.2.2'].includes(browserOriginHost))throw Error('CI fixture origin host is not allowed');
 const connections=new Map(),observations=[],checks=[],pageRequests=[],proxyProbes=[],nodes=[],entryConnections=new Set(),entryProbes=[];
 const geoReply=res=>{res.writeHead(200,{'Content-Type':'application/json','Connection':'close'});res.end(JSON.stringify({status:'success',query:'203.0.113.7',ip:'203.0.113.7',countryCode:'US',country:'CI',timezone:'Etc/UTC',lat:0,lon:0}))};
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
  res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>LYCO selected route fixture</title>${visibleStatus?'<h1 id="route-state" role="status">Loading</h1>':''}<script>(async()=>{
   const readCookie=()=>document.cookie.split('; ').find(s=>s.startsWith('routeOwner='))?.slice(11)||null;
   const before={cookie:readCookie(),local:localStorage.getItem('routeOwner')};
   const owner=${JSON.stringify(owner)},phase=${JSON.stringify(phase)};
   const idb=write=>new Promise((resolve,reject)=>{
    const opening=indexedDB.open('lyco-route-isolation',1);opening.onupgradeneeded=()=>opening.result.createObjectStore('identity');
    opening.onerror=()=>reject(opening.error);opening.onsuccess=()=>{
     const db=opening.result,tx=db.transaction('identity',write===undefined?'readonly':'readwrite'),store=tx.objectStore('identity'),read=store.get('owner');let prior=null;
     read.onsuccess=()=>{prior=read.result??null;if(write!==undefined)store.put(write,'owner')};
     tx.oncomplete=()=>{db.close();resolve(prior)};tx.onabort=()=>{db.close();reject(tx.error)};
    };
   });
   if(${indexedDB})before.indexedDB=await idb();
   document.cookie='routeOwner='+owner+'; Path=/; Max-Age=600; SameSite=Lax';localStorage.setItem('routeOwner',owner);
   const after={cookie:readCookie(),local:localStorage.getItem('routeOwner')};
   if(${indexedDB}){await idb(owner);after.indexedDB=await idb()}
   const reported=await fetch('/report',{method:'POST',body:JSON.stringify({phase,before,after})});
   if(${visibleStatus}&&reported.ok)document.getElementById('route-state').textContent='LYCO route '+${JSON.stringify(route)}+' owner '+owner;
  })();</script>`);
 });
 const originPort=await listen(origin),originUrl=`http://${browserOriginHost}:${originPort}`;
 const geo=http.createServer((_req,res)=>geoReply(res));
 const geoPort=await listen(geo);
 for(const route of ['A','B']){
  const sockets=new Set(),password='CI_PRIVATE_ROUTE_'+route,username='CI_ROUTE_'+route;
  const expected='Basic '+Buffer.from(username+':'+password).toString('base64');
  const entered=socket=>route==='A'&&chainedA?entryConnections.has(socket.remotePort):null;
  const mark=socket=>{const port=socket.localPort;connections.set(port,route);socket.once('close',()=>connections.delete(port))};
  const proxy=http.createServer((req,res)=>{
   const url=new URL(req.url);
   if(proxyProbes.length<100)proxyProbes.push({route,transport:'http',host:url.hostname,authorized:req.headers['proxy-authorization']===expected,viaEntry:entered(req.socket)});
   if(req.headers['proxy-authorization']!==expected){res.writeHead(407).end();return;}
   if(entered(req.socket)===false){res.writeHead(403).end();return;}
   // Match the existing native fixture's explicit CI geo response for both
   // HTTP absolute-form and CONNECT probe transports. This is not real egress.
   if(url.hostname==='ip-api.com'&&url.pathname==='/json/'){geoReply(res);return;}
   if(!['127.0.0.1',browserOriginHost].includes(url.hostname)||Number(url.port)!==originPort){res.writeHead(502).end();return;}
   const upstream=http.request({host:'127.0.0.1',port:originPort,path:url.pathname+url.search,method:req.method,headers:{...req.headers,host:`127.0.0.1:${originPort}`}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res)});
   upstream.on('socket',socket=>{sockets.add(socket);socket.once('connect',()=>mark(socket));socket.once('close',()=>sockets.delete(socket))});
   upstream.on('error',()=>res.destroy());req.pipe(upstream);
  });
  proxy.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket))});
  proxy.on('connect',protectConnectHandler((req,socket,head)=>{
   if(proxyProbes.length<100)proxyProbes.push({route,transport:'connect',target:req.url,authorized:req.headers['proxy-authorization']===expected,viaEntry:entered(socket)});
   if(req.headers['proxy-authorization']!==expected){socket.end('HTTP/1.1 407 Authentication required\r\n\r\n');return;}
   if(entered(socket)===false){socket.end('HTTP/1.1 403 Entry hop required\r\n\r\n');return;}
   const port=[`127.0.0.1:${originPort}`,`${browserOriginHost}:${originPort}`].includes(req.url)?originPort:req.url==='ip-api.com:80'?geoPort:null;
   if(!port){socket.end('HTTP/1.1 502 CI fixture only\r\n\r\n');return;}
   const upstream=net.connect({host:'127.0.0.1',port});sockets.add(upstream);
   upstream.once('connect',()=>{mark(upstream);socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket)});
   socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());upstream.once('close',()=>sockets.delete(upstream));
  }));
  const port=await listen(proxy);nodes.push({route,proxy,sockets,port,username,password,stopped:false});
 }
 if(chainedA){
  const sockets=new Set(),username='CI_ENTRY',password='CI_PRIVATE_ENTRY';
  const expected='Basic '+Buffer.from(username+':'+password).toString('base64'),a=nodes.find(node=>node.route==='A');
  const proxy=http.createServer((_req,res)=>res.writeHead(502).end());
  proxy.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket))});
  proxy.on('connect',protectConnectHandler((req,socket,head)=>{
   const probe={authorized:req.headers['proxy-authorization']===expected,targetIsA:req.url===`127.0.0.1:${a.port}`,connected:false};
   if(entryProbes.length<100)entryProbes.push(probe);
   if(!probe.authorized){socket.end('HTTP/1.1 407 Authentication required\r\n\r\n');return;}
   if(!probe.targetIsA){socket.end('HTTP/1.1 502 Only CI route A allowed\r\n\r\n');return;}
   const upstream=net.connect({host:'127.0.0.1',port:a.port});sockets.add(upstream);let sourcePort;
   upstream.once('connect',()=>{
    sourcePort=upstream.localPort;entryConnections.add(sourcePort);probe.connected=true;
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);
   });
   socket.on('error',()=>upstream.destroy());socket.once('close',()=>upstream.destroy());
   upstream.on('error',()=>socket.destroy());upstream.once('close',()=>{sockets.delete(upstream);entryConnections.delete(sourcePort)});
  }));
  const port=await listen(proxy);nodes.push({route:'ENTRY',proxy,sockets,port,username,password,stopped:false});
 }
 async function stopNode(route){
  const node=nodes.find(row=>row.route===route);if(!node||node.stopped)return;
  node.stopped=true;for(const socket of node.sockets)socket.destroy();await new Promise(resolve=>node.proxy.close(resolve));
 }
 return {originUrl,observations,checks,pageRequests,proxyProbes,entryProbes,
  subscription:{proxies:nodes.map(node=>({name:'CI route '+node.route,type:'http',server:'127.0.0.1',port:node.port,username:node.username,password:node.password,...(chainedA&&node.route==='A'?{'dialer-proxy':'PROXY'}:{})})),
   'proxy-groups':[{name:'PROXY',type:'select',proxies:chainedA?['CI route ENTRY']:['CI route A','CI route B']}]},stopNode,
  async restartNode(route){const node=nodes.find(row=>row.route===route);if(!node?.stopped)throw Error('Only a stopped fixture node may restart');await listen(node.proxy,node.port);node.stopped=false},
  async close(){await Promise.all(nodes.map(node=>stopNode(node.route)));origin.closeAllConnections();geo.closeAllConnections();await Promise.all([new Promise(resolve=>origin.close(resolve)),new Promise(resolve=>geo.close(resolve))])},
 };
}
