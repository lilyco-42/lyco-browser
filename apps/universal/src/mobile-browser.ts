import {requireOptionalNativeModule} from 'expo';
import {parseProxyEndpoint} from './proxy-endpoint.mjs';
import type {Profile,BrowserSession} from './profiles';
import {assertManualProfile,assertPaidProfile,type IdentifiedMobileSubscription,type IdentifiedMobileNode} from './mobile-route-policy.mjs';

type NativeBrowser = {open(options:Record<string,string>):Promise<void>;closeAll():Promise<void>;clearProfile(id:string):Promise<void>};
// A close requested while a native launch is being dispatched must run after
// that launch. Native calls use different queues on Android.
let nativeOperations:Promise<void>=Promise.resolve();
let operationEpoch=0;
function inNativeOrder(operation:()=>Promise<void>):Promise<void>{
 const next=nativeOperations.then(operation);
 nativeOperations=next.catch(()=>{});
 return next;
}
export async function openMobileProfile(profile:Profile, proxyURL:string,canOpen=()=>true):Promise<void> {
 assertManualProfile(profile);
 const epoch=operationEpoch;
 const route=parseProxyEndpoint(proxyURL);
 const native=requireOptionalNativeModule<NativeBrowser>('LycoMobileBrowser');
 if(!native)throw Error('当前安装包未包含原生独立环境，请安装最新原生预览版');
 await inNativeOrder(async()=>{
  if(epoch!==operationEpoch||!canOpen())throw Error('环境启动已取消');
  assertManualProfile(profile);
  await native.open({id:profile.id,name:profile.name,url:profile.url,scheme:route.scheme,host:route.host,port:String(route.port)});
 });
}

export async function openPaidMobileProfile(profile:Profile,subscription:IdentifiedMobileSubscription,node:IdentifiedMobileNode,session:BrowserSession,canOpen=()=>true):Promise<void>{
 const epoch=operationEpoch;
 const native=requireOptionalNativeModule<NativeBrowser>('LycoMobileBrowser');
 if(!native)throw Error('当前安装包未包含原生独立环境');
 await inNativeOrder(async()=>{
 if(epoch!==operationEpoch||!canOpen())throw Error('环境启动已取消');
 assertPaidProfile(profile,subscription,node,session);
 await native.open({id:profile.id,name:profile.name,url:profile.url,outbound:JSON.stringify(node.outbound),
  accountToken:session.token,accountOwner:session.username,
  verificationDeadline:String(Math.min(subscription.verifiedAt+300000,subscription.expiresAt??Infinity))});
 });
}

export async function closeMobileProfiles():Promise<void>{
 operationEpoch++;
 const native=requireOptionalNativeModule<NativeBrowser>('LycoMobileBrowser');
 if(native)await inNativeOrder(()=>native.closeAll());
}

export async function clearMobileProfile(id:string):Promise<void>{
 operationEpoch++;
 const native=requireOptionalNativeModule<NativeBrowser>('LycoMobileBrowser');
 if(!native)throw Error('清除网站数据需要原生移动客户端');
 await inNativeOrder(async()=>{
  await native.closeAll();
  try{await native.clearProfile(id)}finally{await native.closeAll()}
 });
}
