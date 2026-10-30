"""Check actual pinned Mihomo parsing of all retained labelled protocols."""
import json,pathlib,subprocess,sys,tempfile
import proxy_region_labels as regions
assert __import__('os').environ.get('GITHUB_ACTIONS')=='true'
nodes=[]
for index,typ in enumerate(('ss','vless','vmess','trojan','tuic','hysteria2','anytls')):
    n={'name':'owned-'+typ,'type':typ,'server':'192.0.2.42','port':443,'udp':True}
    if typ in ('vless','vmess','tuic'):n['uuid']='00000000-0000-4000-8000-000000000042'
    if typ in ('ss','trojan','tuic','hysteria2','anytls'):n['password']='owned-fixture-only'
    if typ=='ss':n['cipher']='aes-128-gcm'
    elif typ in ('vless','vmess'):n.update(tls=True,servername='example.com')
    else:n.update(sni='example.com',**{'skip-cert-verify':False})
    if typ=='vmess':n.update(cipher='auto',alterId=0)
    if typ=='tuic':n.update(**{'congestion-controller':'bbr','alpn':['h3']})
    nodes.append(n)
catalog={'nodes':nodes,'regions':{'🇯🇵 日本':[n['name'] for n in nodes]}}
config={'mixed-port':17890,'allow-lan':False,'proxies':nodes,
    'proxy-groups':[{'name':'PROXY','type':'select','proxies':[n['name'] for n in nodes]}],'rules':['MATCH,PROXY']}
labelled=regions.label_clash_config(config,metadata=regions.context(catalog,{},{}))
with tempfile.TemporaryDirectory(prefix='region-core-check-') as folder:
    p=pathlib.Path(folder)/'config.json';p.write_text(json.dumps(labelled,ensure_ascii=False))
    subprocess.run([sys.argv[1],'-t','-f',str(p),'-d',folder],check=True,timeout=30)
print('Pinned Mihomo accepted seven labelled protocols, groups, and original-identity metadata')
