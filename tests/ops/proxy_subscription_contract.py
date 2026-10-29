"""Exercise the exact subscription generator with owned, non-network fixtures."""
import ast,base64,copy,json,time
from pathlib import Path


def verify_subscription_contract(app_path,prefer,site_flags):
    source=Path(app_path).read_text();tree=ast.parse(source)
    functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('sub_formats','_parse_vmess')]
    assert {n.name for n in functions}=={'sub_formats','_parse_vmess'}
    for n in functions:n.decorator_list=[]
    owner_uuid='00000000-0000-4000-8000-000000000042'
    payload={'v':'2','ps':'owned-ci-relay','add':'lain42.top','port':'443','id':owner_uuid,'aid':'0',
             'net':'ws','host':'lain42.top','path':'/panel-ws','tls':'tls','sni':'lain42.top'}
    data={'status':'ok','subscription':{'vmess':'vmess://'+base64.b64encode(json.dumps(payload).encode()).decode()}}
    backup={'name':'owned-ci-backup','type':'vless','server':'192.0.2.42','port':443,'uuid':owner_uuid,'tls':True}
    ns={'json':json,'time':time,'HTTPException':RuntimeError,
        'JSONResponse':lambda content,**kwargs:{'config':content,'headers':kwargs.get('headers',{})},
        '_panel_sub':lambda token:copy.deepcopy(data),'_fix_vless':lambda value:value,
        '_lyco_managed_extras':lambda **kwargs:([copy.deepcopy(backup)],{'owned-ci-backup'}),
        '_lyco_site_generic_speed':lambda:{('192.0.2.42',443,'vless'):2000},
        '_lyco_community_full_verified':lambda:[], '_lyco_community_report':lambda:{'nodes':[]},
        '_lyco_verified_japan':lambda:[], '_lyco_public_full_catalog':lambda:([],{}),
        '_lyco_public_candidates_cached':lambda epoch:[], '_lyco_site_youtube_labels':lambda extras:[],
        '_lyco_site_candidates':lambda extras,site:['owned-ci-backup'],'prefer_proxy_gateway':prefer}
    exec(compile(ast.Module(body=functions,type_ignores=[]),'owned-subscription-generator','exec'),ns)
    result=[]
    for fmt in ('clash','clashjp','clashcommunity','clashall'):
        response=ns['sub_formats']('owned-ci-token-never-sent',fmt);cfg=response['config']
        groups={g['name']:g for g in cfg['proxy-groups']};automatic=groups['♻️ 自动选择']
        assert automatic['type']=='fallback' and automatic['proxies'][0]=='owned-ci-relay'
        assert automatic['proxies'].count('owned-ci-relay')==1 and 'owned-ci-backup' in automatic['proxies']
        assert cfg['allow-lan'] is False and cfg['rules'][-1]=='MATCH,PROXY'
        relay=next(n for n in cfg['proxies'] if n['name']=='owned-ci-relay')
        assert relay['uuid']==owner_uuid and relay['tls'] is True and relay['ws-opts']['path']=='/panel-ws'
        for site,title in (('youtube','YouTube'),('chatgpt','ChatGPT')):
            group=next(g for g in groups.values() if title in g['name'] and g['name'].endswith('自动容错'))
            assert group['proxies'][0]==('owned-ci-relay' if site_flags.get(site) else 'owned-ci-backup')
        assert response['headers']['Cache-Control']=='private, no-cache'
        result.append({'format':fmt,'ownedFixtureRelayFirst':True,'existingCredentialAndFallbacksPreserved':True})
    return result
