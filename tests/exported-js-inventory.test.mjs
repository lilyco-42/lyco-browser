import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceFiles,packageFromSource,classifySources} from '../apps/universal/scripts/inventory-exported-js.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Run product verification in GitHub Actions');
const flat=sources=>({version:3,sources,mappings:'',sourcesContent:sources.map(()=>null)});

test('indexed Metro maps retain sources from every embedded section',()=>{
 const value={version:3,sections:[{offset:{line:0,column:0},map:flat(['a','b'])},{offset:{line:1,column:0},map:{version:3,sections:[{offset:{line:0,column:0},map:flat(['c','b'])}]}}]};
 assert.deepEqual(sourceFiles(value),['a','b','c']);
});
test('malformed and external maps fail rather than implying dependencies are absent',()=>{
 for(const value of [null,{version:2,sources:['a'],mappings:''},{version:3,sections:[]},{version:3,sections:[{offset:{line:0,column:0},url:'https://example.test/map'}]},flat([null]),{...flat(['a']),sourcesContent:[]}, {...flat(['a']),sections:[]}, {...flat(['index.js']),sourceRoot:'node_modules/tr46/'},{...flat(['index.js']),sourceRoot:null}])assert.throws(()=>sourceFiles(value));
});
test('recursive maps cannot exhaust the analyzer stack',()=>{
 let value=flat(['a']);for(let i=0;i<34;i++)value={version:3,sections:[{offset:{line:0,column:0},map:value}]};
 assert.throws(()=>sourceFiles(value),/bounds/);
});
test('real Metro virtual polyfill labels are retained without becoming file paths',()=>{
 const labels=['\0polyfill:external-require','\0polyfill:environment-variables','\0polyfill:assets-registry'];
 assert.deepEqual(sourceFiles(flat(labels)),[...labels].sort());
 const classified=classifySources(labels,{packages:[],review:[]});
 assert.deepEqual(classified.syntheticSources,labels);
 assert.equal(classified.packages.length,0);
 assert.throws(()=>sourceFiles(flat(['src/invalid\0path.js'])));
 assert.throws(()=>sourceFiles(flat(['\0polyfill:node_modules/react/index.js'])));
});
test('native paths identify the nearest installed scoped or nested package',()=>{
 assert.equal(packageFromSource('C:\\ci\\node_modules\\outer\\node_modules\\@expo\\cli\\src\\x.js'),'@expo/cli');
 assert.equal(packageFromSource('node_modules/react/cjs/react.production.js'),'react');
 assert.equal(packageFromSource('../../node_modules/tr46/index.js'),'tr46');
 assert.equal(packageFromSource('src/components/tr46.tsx'),null);
});
test('only actual source records count; a notice catalog does not imply bundled code',()=>{
 const notices={packages:[{name:'tr46',id:'node_modules/tr46',version:'0.0.3'}],review:[{id:'node_modules/tr46',reason:'missing original'}]};
 const absent=classifySources(['src/npm-notices.json','src/tr46-help.tsx'],notices);
 assert.equal(absent.reviewTargets.find(row=>row.name==='tr46').observedInExport,false);
 const present=classifySources(['node_modules/tr46/index.js'],notices);
 assert.equal(present.reviewTargets.find(row=>row.name==='tr46').observedInExport,true);
 assert.deepEqual(present.packages[0].noticeReview,notices.review);
});
test('ambiguous installed versions and unmapped package records remain visible',()=>{
 const notices={packages:[{name:'react',version:'19.2.3'},{name:'react',version:'19.1.0'}],review:[]};
 const result=classifySources(['node_modules/react/index.js','node_modules/unresolved/index.js'],notices);
 assert.deepEqual(result.packages.find(row=>row.name==='react').installed,['19.1.0','19.2.3']);
 assert.deepEqual(result.unmappedPackages,['unresolved']);
});
