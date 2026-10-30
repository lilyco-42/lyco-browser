import {digestStringAsync,CryptoDigestAlgorithm} from 'expo-crypto';
import {nodeIdentityInput,type IdentifiedMobileSubscription} from './mobile-route-policy.mjs';
import type {MobileSubscription} from './billing';
export async function identifyMobileSubscription(source:MobileSubscription):Promise<IdentifiedMobileSubscription>{
 const nodes=await Promise.all(source.nodes.map(async node=>({...node,id:await digestStringAsync(CryptoDigestAlgorithm.SHA256,nodeIdentityInput(node))})));
 return {...source,nodes};
}
