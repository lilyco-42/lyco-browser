"""Expose complete manual catalogues without changing any automatic route pool."""
import base64,copy,hashlib,json
from urllib.parse import quote,unquote

AREAS=('🇭🇰 香港','🇰🇷 韩国','🇵🇭 菲律宾','🇦🇺 澳大利亚')

def complete_manual_config(config,managed,full,regions,healthy):
    cfg=copy.deepcopy(config)
    nodes={n['name']:n for n in cfg['proxies']}
    used=set(nodes)|{g['name'] for g in cfg['proxy-groups']}
    root=next(g for g in cfg['proxy-groups'] if g['name']=='PROXY')

    def signature(node):
        return json.dumps({k:v for k,v in node.items() if k not in ('name','x-lyco-original-name')},sort_keys=True,separators=(',',':'))

    def add_node(source):
        node=copy.deepcopy(source);name=node['name']
        if name in nodes and signature(nodes[name])==signature(node):return name
        if name in used:
            name+=' · 目录-'+hashlib.sha256(signature(node).encode()).hexdigest()[:8]
            suffix=1;base=name
            while name in used:
                if name in nodes and signature(nodes[name])==signature(node):return name
                suffix+=1;name=base+'-'+str(suffix)
        node['name']=name;cfg['proxies'].append(node);nodes[name]=node;used.add(name)
        return name

    def add_group(name,members):
        members=list(dict.fromkeys(members))
        if not members:return None
        base=name;suffix=1
        while name in used:suffix+=1;name=base+' '+str(suffix)
        cfg['proxy-groups'].append({'name':name,'type':'select','proxies':members});used.add(name)
        return name

    managed_names={n['name']:add_node(n) for n in managed}
    groups=[]
    for area in AREAS+('🌍 其他地区',):
        members=[managed_names[n['name']] for n in managed if
            (n['name'].startswith(area) if area!='🌍 其他地区' else not any(n['name'].startswith(a) for a in AREAS))]
        name=add_group('🗂️ 会员全部 · '+area,members)
        if name:groups.append(name)
    passed=add_group('✅ 会员当前检测通过',[name for original,name in managed_names.items() if original in healthy])
    pending=add_group('🔎 会员待复核 · 仍可手选',[name for original,name in managed_names.items() if original not in healthy])
    groups.extend(n for n in (passed,pending) if n)
    name=add_group('🗂️ 会员节点 · 完整目录',groups)
    if name:root['proxies'].append(name)

    full_names={n['name']:add_node(n) for n in full}
    groups=[];assigned=set()
    for area,members in regions.items():
        selected=[full_names[n] for n in members if n in full_names]
        assigned.update(selected)
        name=add_group('🗂️ 普通全部 · '+area,selected)
        if name:groups.append(name)
    remaining=[name for name in full_names.values() if name not in assigned]
    name=add_group('🗂️ 普通全部 · 地区待确认',remaining)
    if name:groups.append(name)
    name=add_group('🗂️ 普通节点 · 完整目录（含未验证）',groups)
    if name:root['proxies'].append(name)
    return cfg

def complete_share_links(links,managed,full):
    result=list(links);known=set(result)
    for link in list(managed)+list(full):
        try:
            if link.startswith('vmess://'):
                value=link[8:];node=json.loads(base64.urlsafe_b64decode(value+'='*(-len(value)%4)))
                if not node.get('ps','').endswith(' · 手动目录'):node['ps']=node.get('ps','VMess')+' · 手动目录'
                link='vmess://'+base64.b64encode(json.dumps(node,ensure_ascii=False).encode()).decode()
            elif '://' in link:
                body,_,name=link.partition('#');title=unquote(name) or link.split('://',1)[0].upper()
                if not title.endswith(' · 手动目录'):title+=' · 手动目录'
                link=body+'#'+quote(title,safe='')
        except (ValueError,TypeError,AttributeError):pass
        if link not in known:result.append(link);known.add(link)
    return result
