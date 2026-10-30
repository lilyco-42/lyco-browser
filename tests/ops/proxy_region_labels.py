"""Display-only subscription regions; never infer exit country from an entry IP."""
import base64, copy, hashlib, json, pathlib, re
from urllib.parse import urlsplit, unquote, quote

AREAS={'JP':'🇯🇵 日本','US':'🇺🇸 美国','CA':'🇨🇦 加拿大','KR':'🇰🇷 韩国',
       'HK':'🇭🇰 香港','SG':'🇸🇬 新加坡','AU':'🇦🇺 澳大利亚','TW':'🇹🇼 台湾',
       'GB':'🇬🇧 英国','DE':'🇩🇪 德国','FR':'🇫🇷 法国','PH':'🇵🇭 菲律宾'}
UNKNOWN='🌍 地区待确认'

def identity(node):
    return (node.get('type'),str(node.get('server','')).lower(),str(node.get('port','')),
            node.get('uuid') or node.get('password') or '')

def context(catalog=None,proof=None,config=None):
    def read(name):
        try:
            p=pathlib.Path(name)
            if p.stat().st_size>8*1024*1024:return {}
            return json.loads(p.read_text())
        except (OSError,ValueError):return {}
    if catalog is None:catalog=read('/opt/freeproxy-pool/cache/public-full-catalog.json')
    if proof is None:proof=read('/opt/studio-billing/proxy-gateway-preference.json')
    if config is None:config=read('/etc/sing-box/config.json')
    by_name={n.get('name'):n for n in catalog.get('nodes',[]) if isinstance(n,dict)}
    index={}
    for region,names in catalog.get('regions',{}).items():
        if region not in AREAS.values():continue
        for name in names:
            if name in by_name:index.setdefault(identity(by_name[name]),set()).add(region)
    digest=hashlib.sha256(json.dumps({k:config.get(k) for k in ('outbounds','route','dns')},sort_keys=True,separators=(',',':')).encode()).hexdigest()
    country=proof.get('egress_country') if proof.get('enabled') is True and proof.get('routing_sha256')==digest else None
    return {'index':index,'gateway':AREAS.get(country)}

def display_name(node,metadata):
    name=node.get('name','')
    if not isinstance(name,str) or not name:return name
    # Explicit provider labels remain source labels, never geolocation claims.
    if any(area in name for area in AREAS.values()):return name
    if name.startswith(UNKNOWN):return name
    host=str(node.get('server','')).lower()
    relay=(host in ('lain42.top','8.153.102.122') and node.get('type')=='vmess'
           and str(node.get('port'))=='443' and node.get('network')=='ws'
           and (node.get('ws-opts') or {}).get('path','').split('?',1)[0]=='/panel-ws')
    if relay and metadata.get('gateway'):return metadata['gateway']+'中转 · '+name
    regions=metadata['index'].get(identity(node),set())
    if len(regions)==1:
        area=next(iter(regions))+'（来源标注）'
    else:area=UNKNOWN
    return area+' · '+name.replace('公共已验','普通节点').replace('公共候选','普通节点')

def label_clash_config(config,*,metadata=None):
    metadata=context() if metadata is None else metadata
    result=copy.deepcopy(config);renames={};used={g['name'] for g in result.get('proxy-groups',[])}
    for node in result.get('proxies',[]):
        old=node['name'];new=display_name(node,metadata);base=new;i=1
        while new in used:i+=1;new=base+' · '+str(i)
        used.add(new);renames[old]=new
        if new!=old:
            node['x-lyco-original-name']=old
            node['name']=new
    def reference(name):return renames.get(name,name)
    for node in result.get('proxies',[]):
        if 'dialer-proxy' in node:node['dialer-proxy']=reference(node['dialer-proxy'])
    for group in result.get('proxy-groups',[]):
        group['proxies']=[reference(n) for n in group.get('proxies',[])]
        if 'default-selected' in group:group['default-selected']=reference(group['default-selected'])
    rules=[]
    for rule in result.get('rules',[]):
        parts=rule.split(',');target=-2 if parts[-1]=='no-resolve' else -1
        parts[target]=reference(parts[target]);rules.append(','.join(parts))
    if 'rules' in result:result['rules']=rules
    return result

def _decode(value):
    return base64.urlsafe_b64decode(value+'='*(-len(value)%4))

def label_share_links(links,*,metadata=None):
    metadata=context() if metadata is None else metadata
    result=[]
    for link in links:
        try:
            if link.startswith('vmess://'):
                obj=json.loads(_decode(link[8:]));node={'type':'vmess','name':obj.get('ps','VMess'),
                    'server':obj.get('add'),'port':obj.get('port'), 'uuid':obj.get('id'),
                    'network':obj.get('net'),'ws-opts':{'path':obj.get('path')}}
                title=display_name(node,metadata)
                if title!=node['name']:
                    obj['ps']=title;link='vmess://'+base64.b64encode(json.dumps(obj,ensure_ascii=False).encode()).decode()
            else:
                parsed=urlsplit(link);typ={'hy2':'hysteria2'}.get(parsed.scheme,parsed.scheme)
                if typ not in ('vless','trojan','ss','hysteria2','tuic','anytls'):
                    result.append(link);continue
                node={'type':typ,'name':unquote(parsed.fragment) or typ.upper(),
                    'server':parsed.hostname,'port':parsed.port}
                if typ in ('vless','tuic'):node['uuid']=unquote(parsed.username or '')
                if typ in ('trojan','hysteria2','anytls'):node['password']=unquote(parsed.username or '')
                if typ=='tuic':node['password']=unquote(parsed.password or '')
                if typ=='ss':node['password']=_decode(unquote(parsed.username or '')).decode().split(':',1)[1]
                title=display_name(node,metadata)
                if title!=node['name']:link=link.split('#',1)[0]+'#'+quote(title,safe='')
        except (ValueError,TypeError,KeyError,AttributeError,IndexError):pass
        result.append(link)
    return result
