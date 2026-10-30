import base64,hashlib,json,unittest
from urllib.parse import quote,unquote
import proxy_region_labels as regions

class RegionLabels(unittest.TestCase):
    def setUp(self):
        self.node={'name':'🌐 公共已验 · SS · abcdef42','type':'ss','server':'192.0.2.42','port':443,'password':'owned-fixture-only','cipher':'aes-128-gcm'}
        raw=dict(self.node,name='source-japan')
        self.meta=regions.context({'nodes':[raw],'regions':{'🇯🇵 日本':['source-japan']}},{},{})
        self.cfg={'proxies':[self.node], 'proxy-groups':[{'name':'PROXY','type':'select','proxies':[self.node['name']],'default-selected':self.node['name']}],'rules':['MATCH,PROXY']}

    def test_source_region_is_visible_and_all_references_preserved(self):
        original=json.dumps(self.cfg,sort_keys=True);out=regions.label_clash_config(self.cfg,metadata=self.meta);node=out['proxies'][0]
        self.assertIn('🇯🇵 日本（来源标注）',node['name']);self.assertIn('普通节点',node['name'])
        self.assertEqual({k:v for k,v in node.items() if k not in ('name','x-lyco-original-name')},{k:v for k,v in self.node.items() if k!='name'})
        self.assertEqual(node['x-lyco-original-name'],self.node['name'])
        self.assertEqual(out['proxy-groups'][0]['proxies'],[node['name']]);self.assertEqual(out['proxy-groups'][0]['default-selected'],node['name'])
        self.assertEqual(json.dumps(self.cfg,sort_keys=True),original)
        self.assertEqual(regions.label_clash_config(out,metadata=self.meta),out)

    def test_ambiguous_or_missing_region_is_not_guessed_from_server(self):
        self.meta['index'][regions.identity(self.node)].add('🇺🇸 美国')
        self.assertTrue(regions.display_name(self.node,self.meta).startswith(regions.UNKNOWN))
        self.assertTrue(regions.display_name(dict(self.node,server='198.51.100.1'),self.meta).startswith(regions.UNKNOWN))

    def test_gateway_country_requires_matching_routing_evidence(self):
        config={'outbounds':[],'route':{},'dns':{}}
        digest=hashlib.sha256(json.dumps(config,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        proof={'enabled':True,'routing_sha256':digest,'egress_country':'AU'}
        node={'name':'member','type':'vmess','server':'lain42.top','port':443,'network':'ws','ws-opts':{'path':'/panel-ws'}}
        self.assertIn('澳大利亚中转',regions.display_name(node,regions.context({},proof,config)))
        proof['routing_sha256']='stale';self.assertTrue(regions.display_name(node,regions.context({},proof,config)).startswith(regions.UNKNOWN))

    def test_ss_links_change_only_display_fragment(self):
        user=base64.urlsafe_b64encode(b'aes-128-gcm:owned-fixture-only').decode().rstrip('=')
        link='ss://'+user+'@192.0.2.42:443#'+quote(self.node['name'])
        actual=regions.label_share_links([link],metadata=self.meta)[0]
        self.assertEqual(actual.split('#')[0],link.split('#')[0]);self.assertIn('日本',unquote(actual.split('#')[1]))
        self.assertEqual(regions.label_share_links([actual],metadata=self.meta),[actual])

    def test_known_labels_and_invalid_links_are_preserved(self):
        node=dict(self.node,name='🇭🇰 香港 · VMess')
        self.assertEqual(regions.display_name(node,self.meta),node['name'])
        links=['vmess://bad', 'custom://unchanged']
        self.assertEqual(regions.label_share_links(links,metadata=self.meta),links)

    def test_all_catalogue_entries_and_protocols_survive(self):
        nodes=[dict(self.node,name='node-'+typ,type=typ) for typ in ('ss','vless','vmess','trojan','tuic','hysteria2','anytls')]
        cfg={'proxies':nodes,'proxy-groups':[{'name':'PROXY','type':'select','proxies':[n['name'] for n in nodes]}]}
        out=regions.label_clash_config(cfg,metadata=self.meta)
        self.assertEqual(len(out['proxies']),7);self.assertEqual([n['type'] for n in out['proxies']],[n['type'] for n in nodes])
        self.assertEqual(set(out['proxy-groups'][0]['proxies']),{n['name'] for n in out['proxies']})

if __name__=='__main__':unittest.main()
