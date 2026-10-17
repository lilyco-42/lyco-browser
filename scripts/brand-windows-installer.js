'use strict';
const fs=require('node:fs'),path=require('node:path');

// Keep binary names and upstream notices intact. Only the Windows installer
// function owns the install location, shortcuts and uninstall identity.
module.exports=function brandWindowsInstaller(appRoot) {
 const file=path.join(appRoot,'scripts','package-portable.js');
 const source=fs.readFileSync(file,'utf8');
 const start=source.indexOf('function packageWindowsInstaller(packageRoot) {');
 const end=source.indexOf('function ensureResolvedHostDist()',start);
 if(start<0||end<0)throw Error('Pinned Windows installer function changed');
 let installer=source.slice(start,end);
 if(!installer.includes("'Name \"OpenBrowser\"'")||!installer.includes('RequestExecutionLevel user'))throw Error('Pinned installer identity changed');
 installer=installer.replaceAll('OpenBrowser','LYCO Browser').replaceAll('LYCO Browser.exe','OpenBrowser.exe');
 const anchor="    '!define MUI_ABORTWARNING',";
 if(installer.split(anchor).length!==2)throw Error('Pinned NSIS icon anchor changed');
 installer=installer.replace(anchor,[anchor,
  '    `!define MUI_ICON "${nsisPath(path.join(appRoot, \'assets\', \'logo.ico\'))}"`,',
  '    `!define MUI_UNICON "${nsisPath(path.join(appRoot, \'assets\', \'logo.ico\'))}"`,',
 ].join('\n'));
 fs.writeFileSync(file,source.slice(0,start)+installer+source.slice(end),'utf8');
};
