#!/usr/bin/env python3
"""Fail-closed deep quality gate for externally supplied proxy nodes.

Pass needs real bytes, Youtube resources, API unauthenticated reachability
and verified exit IP; does NOT certify login, video playback, or subscriber RTT.
No unverified source is ever tested/published by this layer.
"""
import concurrent.futures
import datetime as dt
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import verify_community as base

CACHE=Path("/opt/freeproxy-pool/cache")
SOURCE=CACHE/"community-verified.json"
DEST=CACHE/"community-quality.json"
MAX_NODES=60
WORKERS=3
DOWNLOAD_BYTES=4194304
MIN_SAMPLE_KIBPS=256
MIN_MEDIAN_KIBPS=320
MAX_SAMPLE_SECS=18
SAMPLE_URL="https://speed.cloudflare.com/__down?bytes=4194304"

def fetch(opener,url,max_bytes,timeout=7):
    start=time.monotonic()
    req=urllib.request.Request(url,headers={"User-Agent":"LYCO-quality-probe/1.0","Cache-Control":"no-cache"})
    try:
        with opener.open(req,timeout=timeout) as r:
            code=r.status
            data=bytearray()
            # Controlled byte count; connection may be slow, capped by deadline.
            while len(data)<max_bytes and time.monotonic()-start<MAX_SAMPLE_SECS:
                part=r.read(min(16384,max_bytes-len(data)))
                if not part:break
                data.extend(part)
        return code,bytes(data),round(time.monotonic()-start,3)
    except urllib.error.HTTPError as e:
        return e.code,b"",round(time.monotonic()-start,3)
    except Exception:
        return 0,b"",round(time.monotonic()-start,3)

def assess(n):
    name=n.get("name","")
    result={"name":name,"youtube_204":0,"youtube_image":0,"openai_api":0,
            "samples_kib_s":[],"sample_bytes":[],"download_elapsed_ms":[],"https_latency_ms":None,
            "exit_hash":None,"qualified":False,"reason":"probe_failed"}
    try:
        if not base.valid(n):
            result["reason"]="invalid_config";return result
        with tempfile.TemporaryDirectory(prefix="lyco-deep-") as d,open(os.devnull,"wb") as quiet:
            port=base.pick_port()
            config=Path(d)/"config.json"
            config.write_text(json.dumps({
                "log":{"level":"error"},
                "inbounds":[{"type":"http","tag":"local","listen":"127.0.0.1","listen_port":port}],
                "outbounds":[base.outbound(n)],
                "route":{"final":"community-test"}
            }),encoding="utf8")
            check=subprocess.run([base.BINARY,"check","-c",str(config)],
                                 stdout=quiet,stderr=quiet,timeout=5)
            if check.returncode:
                result["reason"]="config_rejected";return result
            proc=subprocess.Popen([base.BINARY,"run","-c",str(config)],
                                  stdout=quiet,stderr=quiet)
            try:
                time.sleep(.3)
                if proc.poll() is not None:
                    result["reason"]="proxy_exit_failed";return result
                opener=urllib.request.build_opener(urllib.request.ProxyHandler({
                    "https":"http://127.0.0.1:"+str(port)}))
                y,_,latency=fetch(opener,"https://www.youtube.com/generate_204",16,timeout=5)
                result["https_latency_ms"]=round(latency*1000)
                result["youtube_204"]=y
                image,data,_=fetch(opener,"https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",8192,timeout=6)
                result["youtube_image"]=image if len(data)>=4096 else 0
                g,_,_=fetch(opener,"https://api.openai.com/v1/models",256,timeout=6)
                result["openai_api"]=g
                if y!=204 or result["youtube_image"]!=200 or g!=401:
                    result["reason"]="website_endpoints_incomplete";return result
                ex,payload,_=fetch(opener,"https://api.ipify.org",64,timeout=6)
                try:ip=ipaddress.ip_address(payload.decode("ascii").strip())
                except (UnicodeError,ValueError):ip=None
                if ex!=200 or ip is None or not ip.is_global:
                    result["reason"]="exit_identity_unconfirmed";return result
                # Exposes only a hash internally, not the real exit address.
                result["exit_hash"]=hashlib.sha256(ip.compressed.encode()).hexdigest()
                for i in range(2):
                    code,blob,secs=fetch(opener,SAMPLE_URL+("&probe="+str(i)),DOWNLOAD_BYTES,timeout=6)
                    speed=round(len(blob)/1024/max(secs,.001))
                    result["samples_kib_s"].append(speed)
                    result["sample_bytes"].append(len(blob))
                    result["download_elapsed_ms"].append(round(secs*1000))
                    if code!=200 or len(blob)!=DOWNLOAD_BYTES:
                        result["reason"]="download_incomplete";return result
                lo,hi=sorted(result["samples_kib_s"])
                if lo<MIN_SAMPLE_KIBPS or (lo+hi)/2<MIN_MEDIAN_KIBPS:
                    result["reason"]="throughput_below_floor";return result
                result["qualified"]=True;result["reason"]="quality_qualified"
                return result
            finally:
                proc.terminate()
                try:proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    try:proc.wait(timeout=2)
                    except subprocess.TimeoutExpired:pass
    except Exception:
        return result

def run():
    document=json.loads(SOURCE.read_text(encoding="utf8"))
    if document.get("schema_version")!=2 or document.get("scope")!="paid-verified-all":
        raise RuntimeError("Required twice verified source missing")
    stamp=document.get("verified_at_utc")
    expire=dt.datetime.fromisoformat(document["expires_at_utc"])
    now=dt.datetime.now(dt.timezone.utc)
    if not isinstance(stamp,str) or expire.tzinfo is None or expire<=now:
        raise RuntimeError("Source too old: do not publish")
    entries=document.get("nodes")
    if not isinstance(entries,list) or len(entries)>MAX_NODES or len(entries)!=document.get("verified_count"):
        raise RuntimeError("Unsafe source entries")
    candidates=[]
    for entry in entries:
        n=entry.get("node") if isinstance(entry,dict) else None
        if not isinstance(n,dict) or not base.valid(n) or not str(n.get("name","")).startswith("🌐 公共已验 · "):
            raise RuntimeError("Untrusted source entry")
        candidates.append(n)
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results=list(pool.map(assess,candidates))
    # One real egress IP gets one slot, regardless of different protocol labels.
    winners={}
    for item in results:
        if not item["qualified"]:continue
        key=item["exit_hash"]
        speed=min(item["samples_kib_s"])
        if key not in winners or speed>min(winners[key]["samples_kib_s"]):
            winners[key]=item
    qualified={v["name"] for v in winners.values()}
    for item in results:
        if item["qualified"] and item["name"] not in qualified:
            item["qualified"]=False
            item["reason"]="duplicate_exit"
    report={"schema_version":1,"source_verified_at_utc":stamp,
            "checked_at_utc":now.isoformat(),
            "expires_at_utc":min(expire,now+dt.timedelta(hours=4)).isoformat(),
            "scope":"real-https-download-and-site-endpoint-quality-gate",
            "qualified_names":sorted(qualified),
            "quality_passed":len(qualified),
            "tested":len(results),
            "criteria":{"bytes_per_sample":DOWNLOAD_BYTES,"samples":2,
                        "minimum_each_kib_s":MIN_SAMPLE_KIBPS,
                        "minimum_mean_kib_s":MIN_MEDIAN_KIBPS,
                        "youtube_endpoint_required":True,
                        "openai_unauthenticated_api_required":True,
                        "unique_exit_required":True},
            "results":results}
    base.atomic(DEST,report)
    reasons={}
    for item in results:
        reasons[item["reason"]]=reasons.get(item["reason"],0)+1
    print("DEEP_QUALITY",json.dumps({
        "twice_https_verified":len(candidates),"quality_passed":len(qualified),
        "reasons":reasons},ensure_ascii=False),flush=True)
if __name__=="__main__":
    run()
