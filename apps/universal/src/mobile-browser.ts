import {requireOptionalNativeModule} from 'expo';
import {parseProxyEndpoint} from './proxy-endpoint.mjs';
import type {Profile,BrowserSession} from './profiles';
import type {MobileSubscription} from './billing';
import type {MobileNode} from './subscription.mjs';

type NativeBrowser = {open(options:Record<string,string>):Promise<void>};
export async function openMobileProfile(profile:Profile, proxyURL:string):Promise<void> {
 const route=parseProxyEndpoint(proxyURL);
 const native=requireOptionalNativeModule<NativeBrowser>('LycoMobileBrowser');
 if(!native)throw Error('当前安装包未包含原生独立环境，请安装最新原生预览版');
 await native.open({id:profile.id,name:profile.name,url:profile.url,
  scheme:route.scheme,host:route.host,port:String(route.port)});
}

export async function openPaidMobileProfile(profile:Profile,subscription:MobileSubscription,node:MobileNode,session:BrowserSession):Promise<void>{
 const now=Date.now();
 if(subscription.owner!==session.username||!session.token||now-subscription.verifiedAt>=300000||
   (subscription.expiresAt!==null&&subscription.expiresAt<=now))throw Error('权益核实已过期，请重新加载官网线路');
 const native=requireOptionalNativeModule<NativeBrowser>('LycoMobileBrowser');
 if(!native)throw Error('当前安装包未包含原生独立环境');
 await native.open({id:profile.id,name:profile.name,url:profile.url,outbound:JSON.stringify(node.outbound),
  accountToken:session.token,accountOwner:session.username,
  verificationDeadline:String(Math.min(subscription.verifiedAt+300000,subscription.expiresAt??Infinity))});
}
