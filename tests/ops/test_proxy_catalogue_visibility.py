import copy,unittest
from proxy_catalogue_visibility import complete_manual_config,complete_share_links

def node(name,host):return {'name':name,'type':'http','server':host,'port':443,'password':'owned-fixture'}

class CatalogueVisibility(unittest.TestCase):
    def setUp(self):
        self.good=node('🇦🇺 澳大利亚 · HTTP','192.0.2.1')
        self.bad=node('🇰🇷 韩国 · HTTP','192.0.2.2')
        self.full=node('source-japan','192.0.2.3')
        self.cfg={'proxies':[self.good],'proxy-groups':[
            {'name':'AUTO','type':'fallback','proxies':[self.good['name']]},
            {'name':'PROXY','type':'select','proxies':['AUTO',self.good['name']]}],'rules':['MATCH,PROXY']}

    def test_missing_nodes_are_manual_and_original_auto_pool_is_identical(self):
        before=copy.deepcopy(self.cfg)
        out=complete_manual_config(self.cfg,[self.good,self.bad],[self.full],{'🇯🇵 日本':['source-japan']},{self.good['name']})
        self.assertEqual(self.cfg,before);self.assertEqual(out['proxy-groups'][0],before['proxy-groups'][0])
        self.assertEqual(out['rules'],before['rules']);self.assertEqual(len(out['proxies']),3)
        self.assertEqual(out['proxies'][0],self.good)
        added=out['proxy-groups'][2:];self.assertTrue(all(g['type']=='select' for g in added))
        pending=next(g for g in added if '待复核' in g['name']);self.assertEqual(pending['proxies'],[self.bad['name']])
        known={n['name'] for n in out['proxies']}|{g['name'] for g in out['proxy-groups']}
        self.assertTrue(all(n in known for g in out['proxy-groups'] for n in g['proxies']))

    def test_same_name_different_endpoint_is_preserved_without_overwriting(self):
        conflict=node(self.good['name'],'192.0.2.42')
        out=complete_manual_config(self.cfg,[conflict],[],{},set())
        self.assertEqual(len(out['proxies']),2);self.assertEqual(out['proxies'][0],self.good)
        self.assertNotEqual(out['proxies'][1]['name'],self.good['name']);self.assertEqual(out['proxies'][1]['server'],'192.0.2.42')
        self.assertEqual(out['proxy-groups'][0]['proxies'],[self.good['name']])

    def test_missing_region_metadata_does_not_hide_any_catalogue_node(self):
        out=complete_manual_config(self.cfg,[],[self.full],{},set())
        self.assertTrue(any('地区待确认' in g['name'] and self.full['name'] in g['proxies'] for g in out['proxy-groups']))

    def test_share_links_preserve_order_and_original_entries(self):
        original=['original','original','verified']
        self.assertEqual(complete_share_links(original,['verified','manual'],['all','manual']),original+['manual','all'])

if __name__=='__main__':unittest.main()
