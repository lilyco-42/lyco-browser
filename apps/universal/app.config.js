const {parseProductVersion}=require('../../src/product-version');
const product=parseProductVersion(require('./src/product.json'));

module.exports=({config})=>({
 ...config,
 version:product.version,
 android:{...config.android,versionCode:product.build},
 ios:{...config.ios,buildNumber:String(product.build)},
});
