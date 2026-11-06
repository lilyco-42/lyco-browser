import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import path from 'node:path';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Artifact checksums run on Actions only');
const file=process.argv[2];
if(!file)throw Error('Artifact path required');
const hash=createHash('sha256');
for await(const chunk of createReadStream(file))hash.update(chunk);
process.stdout.write(hash.digest('hex')+'  '+path.basename(file)+'\n');
