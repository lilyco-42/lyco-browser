'use strict';
const {createHash} = require('node:crypto');
const {stableVersion, updateAssetUrlIsAllowed} = require('./update-policy');

function parseChecksum(text, name) {
  const matches=[];
  for (const line of String(text).replace(/^\uFEFF/,'').split(/\r?\n/)) {
    const match=/^([a-f\d]{64}) [ *]([^\r\n]+)$/i.exec(line);
    if (match && match[2]===name) matches.push(match[1].toLowerCase());
  }
  return matches.length===1 ? matches[0] : null;
}

async function boundedText(response) {
  if (!response.body || Number(response.headers.get('content-length'))>65536) throw Error('Checksum file is unavailable or too large');
  const reader=response.body.getReader(),chunks=[];
  let size=0;
  try {
    for (;;) {
      const part=await reader.read();
      if (part.done) break;
      size+=part.value.byteLength;
      if (size>65536) throw Error('Checksum file is too large');
      chunks.push(Buffer.from(part.value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } catch(error) { await reader.cancel().catch(()=>{});throw error; }
  finally { reader.releaseLock(); }
}

async function resolveAssetSha256({asset, remoteVersion, release, fetch:request=globalThis.fetch, userAgent='LYCO Browser', timeout=20000}) {
  if (stableVersion('v'+remoteVersion)!==remoteVersion || !updateAssetUrlIsAllowed(asset?.browser_download_url,asset?.name)) return null;
  const canonical='https://github.com/lilyco-42/lyco-browser/releases/download/v'+remoteVersion+'/'+encodeURIComponent(asset.name);
  if (asset.browser_download_url!==canonical) return null;
  if (release) {
    if (release.tag_name!=='v'+remoteVersion || release.draft!==false || release.prerelease!==false) return null;
    const entries=Array.isArray(release.assets)?release.assets.filter(row=>row.name===asset.name&&row.browser_download_url===canonical):[];
    if (entries.length>1) return null;
    const digest=/^sha256:([a-f\d]{64})$/i.exec(entries[0]?.digest||'');
    if (digest) return digest[1].toLowerCase();
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await request(canonical+'.sha256',{redirect:'follow',signal:controller.signal,
      headers:{Accept:'application/octet-stream','User-Agent':userAgent}});
    return response.ok?parseChecksum(await boundedText(response),asset.name):null;
  } finally {clearTimeout(timer);}
}

async function copyVerifiedUpdate({reader,file,expectedSha256,expectedSize,maxBytes,onProgress=()=>{}}) {
  const hash=createHash('sha256');let received=0;
  try {
    if (!/^[a-f\d]{64}$/i.test(expectedSha256||'')) throw Error('更新包缺少有效 SHA-256 校验，未打开安装程序');
    if (!Number.isSafeInteger(maxBytes)||maxBytes<=0) throw Error('更新包大小限制无效');
    for (;;) {
      const part=await reader.read();
      if (part.done) break;
      const bytes=Buffer.from(part.value);received+=bytes.length;
      if (received>maxBytes) throw Error('更新包超出大小限制');
      for (let offset=0;offset<bytes.length;) {
        const result=await file.write(bytes,offset,bytes.length-offset,null);
        if (!Number.isInteger(result.bytesWritten)||result.bytesWritten<=0||result.bytesWritten>bytes.length-offset) throw Error('更新包写入失败');
        offset+=result.bytesWritten;
      }
      hash.update(bytes);onProgress(received);
    }
    if (!received || (Number.isSafeInteger(expectedSize)&&expectedSize>0&&received!==expectedSize)) throw Error('更新包长度不完整，未打开安装程序');
    if (hash.digest('hex')!==expectedSha256.toLowerCase()) throw Error('更新包 SHA-256 校验失败，未打开安装程序');
    return received;
  } catch(error) {await reader.cancel().catch(()=>{});throw error;}
  finally {reader.releaseLock();}
}

module.exports={parseChecksum,resolveAssetSha256,copyVerifiedUpdate};
