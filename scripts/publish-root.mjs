import {readFile,writeFile,copyFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await readFile(path.join(root,'dist/.vite/manifest.json'),'utf8'));
const files=new Set(['index.html','favicon.svg','redline-logo.png']);
for(const entry of Object.values(manifest)){
 files.add(entry.file);
 for(const file of [...entry.css||[],...entry.assets||[]])files.add(file);
}
// Publish only the current manifest, never stale bundles or an offline export.
const allowed=file=>typeof file==='string'&&!file.includes('..')&&!path.isAbsolute(file)&&
 (['index.html','favicon.svg','redline-logo.png'].includes(file)||/^assets\/[\w.-]+\.(js|css|glb|wasm|png|svg)$/.test(file));
let previous=[];
try{previous=JSON.parse(await readFile(path.join(root,'.release-manifest.json'),'utf8'));}catch{}
for(const file of files){
 if(!allowed(file))throw new Error(`Unsafe release path: ${file}`);
 await mkdir(path.dirname(path.join(root,file)),{recursive:true});
 await copyFile(path.join(root,'dist',file),path.join(root,file));
}
for(const file of previous)if(allowed(file)&&!files.has(file))await rm(path.join(root,file),{force:true});
await writeFile(path.join(root,'.release-manifest.json'),JSON.stringify([...files].sort(),null,2)+'\n');
await writeFile(path.join(root,'.nojekyll'),'');
console.log(`Published ${files.size} current build files to repository root.`);
