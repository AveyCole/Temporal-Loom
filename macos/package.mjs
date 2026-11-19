import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {packager} from '@electron/packager';
const here=fileURLToPath(new URL('.',import.meta.url));
process.chdir(here);
const results=await packager({dir:here,asar:false,name:'Temporal Loom',platform:'darwin',arch:'arm64',out:'dist',overwrite:true,icon:'icon.icns',extendInfo:'Info.plist',appBundleId:'com.aveycole.temporalloom',download:{cacheRoot:process.env.ELECTRON_CACHE||'.electron-cache'},ignore:[/^\/dist/,/^\/loom\.iconset/,/^\/\.electron-cache/]});
for(const directory of results){const legal=path.join(directory,'Temporal Loom.app/Contents/Resources/Legal');fs.mkdirSync(legal,{recursive:true});for(const file of ['LICENSE','LICENSES.chromium.html'])if(fs.existsSync(path.join(directory,file)))fs.copyFileSync(path.join(directory,file),path.join(legal,file));}
