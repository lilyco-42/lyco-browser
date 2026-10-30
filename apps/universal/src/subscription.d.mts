export type MobileNode={name:string;outbound:Record<string,unknown>};
export function mobileOutbound(node:unknown):Record<string,unknown>;
export function mobileNodes(subscription:unknown):{nodes:MobileNode[];unavailable:number};
