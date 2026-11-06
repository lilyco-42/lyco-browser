// Genuine Actions only. All CONNECT streams go through the existing owned
// HTTP fixture, preserving its source-port attribution at the original origin.
import http2 from 'node:http2';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

if(process.env.GITHUB_ACTIONS!=='true')throw Error('Actions-only relay fixture');
const evidence=path.resolve(process.argv[2]),keys=path.resolve(process.argv[3]);
const token='lyco-owned-fixture-v1';
const cert=fs.readFileSync(path.join(keys,'trusted.pem'));
const badCert=fs.readFileSync(path.join(keys,'untrusted.pem'));
const anchor=fs.readFileSync(path.join(keys,'trusted-ca.pem'));

async function check(){
  const response=await new Promise((resolve,reject)=>{
    const session=http2.connect('https://127.0.0.1:18082',{ca:anchor,rejectUnauthorized:true});
    const timer=setTimeout(()=>{session.destroy();reject(Error('Relay fixture positive timed out'))},7000);
    session.on('error',error=>{clearTimeout(timer);session.destroy();reject(error)});
    const stream=session.request({':method':'CONNECT',':authority':'lyco-fixture.invalid:18080',
      'x-lyco-owned-relay':token},{endStream:false});
    let body='';
    stream.on('error',error=>{clearTimeout(timer);session.destroy();reject(error)});
    stream.on('response',headers=>{
      if(headers[':status']!==200){clearTimeout(timer);session.destroy();reject(Error('Relay refused the owned tunnel'));return}
      stream.end('GET /probe?case=relay-fixture-control HTTP/1.1\r\nHost: lyco-fixture.invalid:18080\r\nConnection: close\r\n\r\n');
    });
    stream.on('data',chunk=>{body+=chunk;if(body.length>32768){session.destroy();reject(Error('Oversized relay fixture control'))}});
    stream.on('end',()=>{clearTimeout(timer);session.close();resolve(body)});
  });
  assert.match(response,/^HTTP\/1\.[01] 200 /);
  assert.ok(response.includes('LYCO_ORIGIN relay-fixture-control'));
  const negativeCode=await new Promise((resolve,reject)=>{
    const session=http2.connect('https://127.0.0.1:18083',{ca:anchor,rejectUnauthorized:true});
    const timer=setTimeout(()=>{session.destroy();reject(Error('Untrusted relay did not reject promptly'))},7000);
    session.on('connect',()=>{clearTimeout(timer);session.destroy();reject(Error('Untrusted relay certificate was accepted'))});
    session.on('error',error=>{clearTimeout(timer);session.destroy();resolve(error.code)});
  });
  assert.ok(['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_SIGNATURE_FAILURE'].includes(negativeCode),'Expected an actual certificate rejection');
  const events=JSON.parse(fs.readFileSync(path.join(evidence,'network.json'),'utf8'));
  const control=events.filter(row=>row.case==='relay-fixture-control');
  assert.ok(control.length>0 && control.every(row=>row.viaProxy===true));
  const result={scope:'Owned fixture controls only; no native browser proof',positive:true,
    untrustedCertificateRejected:true,negativeErrorCode:negativeCode,globalTrustModified:false,node:process.version};
  fs.writeFileSync(path.join(evidence,'relay-fixture-control.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}

function serve(){
  const state={ready:false,node:process.version,scope:'Owned loopback TCP relay only; no UDP or product adoption',
    certificates:{trustedChainPemSha256:createHash('sha256').update(cert).digest('hex'),
      untrustedChainPemSha256:createHash('sha256').update(badCert).digest('hex'),
      trustedAnchorPemSha256:createHash('sha256').update(anchor).digest('hex')},connections:[],streams:[],tlsErrors:[]};
  const persist=()=>{
    const target=path.join(evidence,'relay-network.json');
    fs.writeFileSync(target+'.tmp',JSON.stringify(state,null,2)+'\n');fs.renameSync(target+'.tmp',target);
  };
  const servers=[];
  for(const [variant,port] of [['trusted',18082],['untrusted',18083]]){
    const server=http2.createSecureServer({key:fs.readFileSync(path.join(keys,variant+'.key')),
      cert:variant==='trusted'?cert:badCert,minVersion:'TLSv1.2',allowHTTP1:false});
    server.on('error',error=>{console.error('Owned relay error',error.code);process.exitCode=1;servers.forEach(s=>s.close())});
    server.on('sessionError',()=>{});
    server.on('secureConnection',socket=>{
      if(state.connections.length<256)state.connections.push({variant,alpn:socket.alpnProtocol,tls:socket.getProtocol()});persist();
    });
    server.on('tlsClientError',error=>{
      if(state.tlsErrors.length<256)state.tlsErrors.push({variant,code:error.code||'unknown'});persist();
    });
    server.on('stream',(stream,headers)=>{
      stream.on('error',()=>{});
      const authority=String(headers[':authority']||'');
      if(headers[':method']!=='CONNECT' || headers[':protocol'] ||
        !['127.0.0.1:18080','lyco-fixture.invalid:18080'].includes(authority) ||
        headers['x-lyco-owned-relay']!==token){stream.respond({':status':403});stream.end();return}
      if(state.streams.length>=256){stream.respond({':status':429});stream.end();return}
      const row={variant,authority,tunnelReady:false,clientBytes:0,originBytes:0};state.streams.push(row);persist();
      stream.pause();
      const upstream=net.createConnection({host:'127.0.0.1',port:18081,allowHalfOpen:true});
      let opened=false,buffer=Buffer.alloc(0),prefix='';
      const fail=()=>{
        upstream.destroy();
        if(!stream.destroyed){if(!stream.headersSent){stream.respond({':status':502});stream.end()}else stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR)}
      };
      upstream.setTimeout(6000,fail);upstream.on('error',fail);
      stream.on('close',()=>{upstream.destroy();persist()});stream.on('aborted',()=>upstream.destroy());
      upstream.once('connect',()=>upstream.write('CONNECT '+authority+' HTTP/1.1\r\nHost: '+authority+'\r\n\r\n'));
      function handshake(chunk){
        buffer=Buffer.concat([buffer,chunk]);
        if(buffer.length>8192){fail();return}
        const boundary=buffer.indexOf('\r\n\r\n');if(boundary<0)return;
        if(!/^HTTP\/1\.[01] 200 /.test(buffer.subarray(0,boundary).toString('ascii'))){fail();return}
        upstream.off('data',handshake);opened=true;row.tunnelReady=true;persist();stream.respond({':status':200});
        stream.on('data',data=>{
          row.clientBytes+=data.length;if(row.clientBytes>32768){fail();return}
          if(!row.case && prefix.length<2048){prefix+=data.toString('ascii');const hit=prefix.match(/^GET \/probe\?case=([a-z0-9-]+) HTTP\/1\.[01]\r\n/);if(hit)row.case=hit[1]}
          persist();
        });
        upstream.on('data',data=>{row.originBytes+=data.length;persist()});
        const rest=buffer.subarray(boundary+4);if(rest.length)stream.write(rest);
        stream.pipe(upstream);upstream.pipe(stream);
      }
      upstream.on('data',handshake);
      upstream.on('end',()=>{if(!opened)fail()});
    });
    servers.push(server);
    server.listen(port,'127.0.0.1',()=>{
      if(servers.length===2 && servers.every(s=>s.listening)){state.ready=true;persist()}
    });
  }
  persist();
  process.on('SIGTERM',()=>{persist();servers.forEach(s=>s.close());setTimeout(()=>process.exit(),250).unref()});
}

if(process.argv[4]==='--check')await check();else serve();
