// Browser transport policy, installed by the public document-start API in all
// frames. It constrains REAL native PeerConnection configuration. ICE events,
// SDP, statistics, candidates and native observations are never rewritten.
(() => {
 'use strict';
 const root=globalThis,apply=Reflect.apply,construct=Reflect.construct;
 const define=Object.defineProperty,create=Object.create;
 const iterator=Symbol.iterator,NativeTypeError=TypeError;
 const trim=String.prototype.trim,lower=String.prototype.toLowerCase;
 const exec=RegExp.prototype.exec;
 const endpoint=/^(turns?):(\[[0-9a-f:.]+\]|[a-z0-9._-]+)(?::([0-9]{1,5}))?(?:\?transport=(tcp|udp))?$/i;
 function tcpUrl(value){
  if(typeof value!=='string'||value.length>2048)return null;
  const text=apply(trim,value,[]),match=apply(exec,endpoint,[text]);
  if(!match)return null;
  const scheme=apply(lower,match[1],[]),transport=match[4]&&apply(lower,match[4],[]);
  if(match[3]&&(+match[3]<1||+match[3]>65535))return null;
  if(transport!=='tcp'&&!(scheme==='turns'&&!transport))return null;
  return scheme+':'+match[2]+(match[3]?':'+match[3]:'')+'?transport=tcp';
 }
 // Native WebIDL accepts iterables. Use owned null-prototype iterators so a
 // page's later Array/Object prototype edits cannot change a validated list.
 function sequence(){
  const values=create(null);let count=0;
  return {
   add(value){define(values,count++,{value})},
   length(){return count},
   result(){
    const value=create(null);
    define(value,iterator,{value:()=>{
     let index=0;const cursor=create(null);
     define(cursor,'next',{value:()=>index<count?{value:values[index++],done:false}:{value:undefined,done:true}});
     return cursor;
    }});
    return value;
   }
  };
 }
 function each(value,visit){
  if(value==null)return;
  const method=value[iterator];
  if(typeof method!=='function')throw new NativeTypeError('RTC configuration requires an iterable');
  const cursor=apply(method,value,[]);
  for(let index=0;index<512;index++){
   const step=apply(cursor.next,cursor,[]);
   if(step.done)return;
   visit(step.value);
  }
  throw new NativeTypeError('RTC configuration exceeds the browser policy bound');
 }
 function configuration(input){
  if(input!=null&&typeof input!=='object'&&typeof input!=='function')throw new NativeTypeError('Invalid RTC configuration');
  const servers=sequence();
  each(input?.iceServers,server=>{
   if(!server||typeof server!=='object')throw new NativeTypeError('Invalid RTC ICE server');
   const urls=sequence(),source=server.urls??server.url;
   const add=value=>{const url=tcpUrl(value);if(url!==null)urls.add(url)};
   if(typeof source==='string')add(source);else each(source,add);
   if(urls.length()){
    const clean={...server,urls:urls.result()};
    delete clean.url;
    servers.add(clean);
   }
  });
  return {...input,iceServers:servers.result(),iceTransportPolicy:'relay'};
 }
 const configured=new WeakSet();
 function wrap(Native){
  if(typeof Native!=='function')return Native;
  const proto=Native.prototype;
  if(!configured.has(proto)){
   const nativeSet=proto.setConfiguration;
   if(typeof nativeSet!=='function')throw new NativeTypeError('RTC configuration policy is unsupported');
   define(proto,'setConfiguration',{value:function setConfiguration(value){
    return apply(nativeSet,this,[configuration(value)]);
   },writable:false,configurable:false});
   configured.add(proto);
  }
  const Wrapped=new Proxy(Native,{construct(target,args,newTarget){
   return construct(target,[configuration(args[0]),args[1]],newTarget);
  }});
  const descriptor=Object.getOwnPropertyDescriptor(proto,'constructor');
  if(!descriptor||descriptor.configurable)define(proto,'constructor',{value:Wrapped,writable:false,configurable:false});
  return Wrapped;
 }
 const Native=root.RTCPeerConnection,legacy=root.webkitRTCPeerConnection;
 const Wrapped=wrap(Native);
 if(typeof Native==='function')define(root,'RTCPeerConnection',{value:Wrapped,writable:false,configurable:false});
 if(typeof legacy==='function')define(root,'webkitRTCPeerConnection',{value:legacy===Native?Wrapped:wrap(legacy),writable:false,configurable:false});
})();
