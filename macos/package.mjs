import {fileURLToPath} from 'node:url';
import {packager} from '@electron/packager';
await packager({dir:fileURLToPath(new URL('.',import.meta.url)),name:'Temporal Loom',platform:'darwin',arch:'arm64',out:'dist',overwrite:true,icon:'icon.icns',extendInfo:'Info.plist',appBundleId:'com.aveycole.temporalloom',download:{cacheRoot:process.env.ELECTRON_CACHE||'.electron-cache'},ignore:[/^\/dist/,/^\/loom\.iconset/,/^\/\.electron-cache/]});
