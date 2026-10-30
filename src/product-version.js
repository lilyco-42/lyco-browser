'use strict';
function parseProductVersion(record) {
  if (!record || typeof record!=='object' || typeof record.version!=='string' || record.version!==record.version.trim()
      || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(record.version)
      || record.version.split('.').some(part=>Number(part)>65535)) throw Error('Invalid common product version');
  if (!Number.isSafeInteger(record.build)||record.build<1||record.build>9999) throw Error('Invalid common product build number');
  if (!['internal-preview','stable'].includes(record.channel)) throw Error('Invalid product channel');
  return Object.freeze({version:record.version,build:record.build,channel:record.channel});
}
module.exports={parseProductVersion};
