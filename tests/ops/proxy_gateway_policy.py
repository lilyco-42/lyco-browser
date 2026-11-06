"""Prefer the verified SSH-backed member relay without renaming saved nodes."""
import hashlib,json
from pathlib import Path

PROOF=Path('/opt/studio-billing/proxy-gateway-preference.json')
CONFIG=Path('/etc/sing-box/config.json')

def routing_digest(config):
    value={name:config.get(name) for name in ('outbounds','route','dns')}
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def read_document(path):
    with Path(path).open('rb') as stream:data=stream.read(2*1024*1024+1)
    if len(data)>2*1024*1024:raise ValueError('oversized document')
    return json.loads(data)

def prefer_gateway(core_nodes,candidates,proof_file=PROOF,config_file=CONFIG,*,site=None):
    original=list(candidates)
    try:
        proof=read_document(proof_file);config=read_document(config_file)
        if (proof.get('schema_version')!=1 or proof.get('enabled') is not True
                or proof.get('routing_sha256')!=routing_digest(config)
                or not isinstance(proof.get('verification_run'),str)
                or not proof['verification_run'].isdigit()
                or proof.get('minimum_complete_sample_bytes',0)<4194304
                or proof.get('minimum_kib_s',0)<900):return original
        if site is not None and (site not in ('youtube','chatgpt') or (proof.get('site_probes') or {}).get(site) is not True):return original
        if not any(n.get('tag')=='ssh-fast' and n.get('type')=='socks'
                   and n.get('server')=='127.0.0.1' and n.get('server_port')==1085
                   for n in config.get('outbounds',[])):return original
        if not any(r.get('inbound')==['panel-in'] and r.get('network')=='tcp'
                   and r.get('outbound')=='ssh-fast' for r in config.get('route',{}).get('rules',[])):return original
        relay=next((n.get('name') for n in core_nodes if isinstance(n,dict)
            and n.get('type')=='vmess' and n.get('network')=='ws'
            and n.get('tls') is True and n.get('skip-cert-verify') is not True
            and n.get('port')==443 and (n.get('ws-opts') or {}).get('path','').split('?',1)[0]=='/panel-ws'
            and isinstance(n.get('name'),str) and n['name']),None)
        if relay:return [relay]+[name for name in original if name!=relay]
    except (OSError,ValueError,TypeError,KeyError,AttributeError):
        pass
    return original
