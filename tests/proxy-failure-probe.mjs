import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {createHash} from 'node:crypto';

// Owns every endpoint. HTTPS evidence is a real browser TLS ClientHello at a
// TCP receiver, not a trusted HTTPS response or a broad DNS/IPv6 leak claim.
export async function createProxyFailureProbe(){
 if(process.env.GITHUB_ACTIONS!=='true')throw Error('Actions only');
 let phase='live';
 const rows=[],tlsRows=[],proxyPorts=new Set(),sockets=new Set();
 const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
 const origin=http.createServer((req,res)=>{
  rows.push({phase,kind:'http',port:req.socket.remotePort});
  res.writeHead(200,{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store','Content-Type':'text/plain'});
  res.end('LYCO failure fixture');
 });
 origin.on('upgrade',(req,socket)=>{
  rows.push({phase,kind:'websocket',port:socket.remotePort});
  const accept=createHash('sha1').update(String(req.headers['sec-websocket-key'])+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  socket.on('data',()=>socket.end(Buffer.from([0x88,0])));
 });
 const tlsReceiver=net.createServer(socket=>{
  const row={phase,port:socket.remotePort,bytes:0,clientHello:false};tlsRows.push(row);
  socket.once('data',packet=>{row.bytes=packet.length;row.clientHello=packet[0]===0x16&&packet.length>=5;socket.destroy()});
 });
 for(const server of [origin,tlsReceiver])server.on('connection',socket=>{
  sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>sockets.delete(socket));
 });
 const httpPort=await listen(origin),tlsPort=await listen(tlsReceiver);
 const endpoints={httpURL:`http://127.0.0.1:${httpPort}/http`,wsURL:`ws://127.0.0.1:${httpPort}/ws`,httpsURL:`https://127.0.0.1:${tlsPort}/tls`};
 const snapshot=()=>({requests:rows.map(row=>({phase:row.phase,kind:row.kind,proxied:proxyPorts.has(row.port)})),
  tlsConnections:tlsRows.map(row=>({phase:row.phase,bytes:row.bytes,clientHello:row.clientHello,proxied:proxyPorts.has(row.port)}))});
 async function attempts(page){
  return page.evaluate(async({httpURL,wsURL,httpsURL})=>{
   async function request(url){
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),4000);
    try{const response=await fetch(url,{cache:'no-store',signal:abort.signal});return {attempted:true,ok:response.ok}}
    catch{return {attempted:true,ok:false}}
    finally{clearTimeout(timer)}
   }
   const websocket=new Promise(resolve=>{
    const socket=new WebSocket(wsURL);let finished=false;
    const finish=ok=>{if(finished)return;finished=true;clearTimeout(timer);socket.close();resolve({attempted:true,ok})};
    const timer=setTimeout(()=>finish(false),4000);
    socket.onopen=()=>finish(true);socket.onerror=()=>finish(false);
   });
   const [http,https,ws]=await Promise.all([request(httpURL),request(httpsURL),websocket]);
   return {http,https,ws};
  },endpoints);
 }
 return {
  ports:[httpPort,tlsPort],
  markProxyPort:port=>proxyPorts.add(port),
  snapshot,
  async auditUnmanaged(page){
   phase='unmanaged-browser';
   const results=await attempts(page);
   assert.equal(results.http.ok,true,'Unmanaged native HTTP control failed');
   assert.equal(results.ws.ok,true,'Unmanaged native WebSocket control failed');
   const direct=rows.filter(row=>row.phase===phase),tls=tlsRows.filter(row=>row.phase===phase);
   assert.ok(direct.some(row=>row.kind==='http')&&direct.some(row=>row.kind==='websocket'));
   assert.ok(direct.every(row=>!proxyPorts.has(row.port)),'Unmanaged control unexpectedly used the managed proxy');
   assert.ok(tls.some(row=>row.clientHello)&&tls.every(row=>!proxyPorts.has(row.port)),'Unmanaged native TLS control was not observed directly');
   return {results,...snapshot()};
  },
  async audit(page,stopProxy){
   const live=await attempts(page);
   assert.equal(live.http.ok,true,'Live native HTTP proxy control failed');
   assert.equal(live.ws.ok,true,'Live native WebSocket proxy control failed');
   assert.ok(rows.some(row=>row.phase==='live'&&row.kind==='http'));
   assert.ok(rows.some(row=>row.phase==='live'&&row.kind==='websocket'));
   assert.ok(rows.filter(row=>row.phase==='live').every(row=>proxyPorts.has(row.port)),'Live browser bypassed the proxy');
   assert.ok(tlsRows.some(row=>row.phase==='live'&&row.clientHello&&proxyPorts.has(row.port)),'No proxied native TLS ClientHello reached the receiver');
   assert.ok(tlsRows.filter(row=>row.phase==='live').every(row=>proxyPorts.has(row.port)),'Live TLS connection bypassed the proxy');
   await stopProxy();phase='closed';
   const closed=await attempts(page);
   for(const result of Object.values(closed)){assert.equal(result.attempted,true);assert.equal(result.ok,false,'A failed proxy request succeeded')}
   assert.equal(rows.filter(row=>row.phase==='closed').length,0,'HTTP/WebSocket reached the origin after proxy failure');
   assert.equal(tlsRows.filter(row=>row.phase==='closed').length,0,'A direct HTTPS connection reached the TLS receiver after proxy failure');
   // Keep a direct positive control after the failure. Empty captures must not
   // pass merely because the origin or the receiver stopped listening.
   phase='direct-control';
   const control=await new Promise((resolve,reject)=>{
    const request=http.get(endpoints.httpURL,res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve(body))});
    request.on('error',reject);request.setTimeout(4000,()=>request.destroy(Error('Direct origin control timed out')));
   });
   assert.equal(control,'LYCO failure fixture');
   await new Promise((resolve,reject)=>{
    const socket=net.connect(tlsPort,'127.0.0.1',()=>socket.write(Buffer.from([0x16,3,3,0,0])));
    socket.setTimeout(4000,()=>socket.destroy(Error('Direct TLS receiver control timed out')));
    socket.once('error',reject);socket.once('close',resolve);
   });
   assert.ok(tlsRows.some(row=>row.phase==='direct-control'&&row.clientHello&&!proxyPorts.has(row.port)));
   return {live,closed,...snapshot()};
  },
  async close(){for(const socket of sockets)socket.destroy();await Promise.all([origin,tlsReceiver].map(server=>new Promise(resolve=>server.close(resolve))))}
 };
}
