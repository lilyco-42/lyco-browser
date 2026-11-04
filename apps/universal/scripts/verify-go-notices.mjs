import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const sha=data=>createHash('sha256').update(data).digest('hex');
const raw=readFileSync(new URL('../src/go-notices.json',import.meta.url));
const catalog=JSON.parse(raw);
const source=JSON.parse(readFileSync(new URL('../third-party/go-notices-source.json',import.meta.url)));
assert.equal(sha(raw),source.catalogSha256,'Offline Go notices differ from the retained original catalog');
assert.equal(catalog.generated,true);
assert.equal(catalog.schemaVersion,1);
assert.equal(catalog.goVersion,'go1.25.5');
assert.equal(catalog.sourceRun,source.sourceRun);
assert.equal(catalog.producerCommit,source.producerCommit);
assert.equal(execFileSync('git',['rev-parse','HEAD:mobile/core'],{encoding:'utf8'}).trim(),source.coreSourceTree,'Refresh actual native Go source evidence after changing core inputs');
const sum=readFileSync(new URL('../../../mobile/core/go.sum',import.meta.url));
assert.equal(sha(sum),catalog.originalGoSumSha256);
assert.equal(sha(readFileSync(new URL('../../../mobile/core/go.mod',import.meta.url))),catalog.originalGoModSha256);
const lines=new Set(sum.toString('utf8').split(/\r?\n/));
assert(catalog.packages.length>0&&catalog.packages.length<=256);
assert.equal(new Set(catalog.packages.map(row=>row.id)).size,catalog.packages.length);
let count=0;
for(const row of catalog.packages){
 assert.equal(row.id,row.name+'@'+row.version);
 assert(lines.has(`${row.name} ${row.version} ${row.sum}`));
 assert(lines.has(`${row.name} ${row.version}/go.mod ${row.goModSum}`));
 assert.equal(new Set(row.files.map(file=>file.name)).size,row.files.length);
 for(const file of row.files){
  assert.equal(typeof file.text,'string');
  assert.equal(sha(Buffer.from(file.text,'utf8')),file.sha256,'Original Go notice text changed');
  count++;
 }
}
assert.equal(catalog.packages.length,source.moduleCount);
assert.equal(count,source.noticeFiles);
console.log(`Verified original offline Go notices: ${catalog.packages.length} modules, ${count} files`);
