import {readFile,writeFile,copyFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await readFile(path.join(root,'dist/.vite/manifest.json'),'utf8'));
const entry=manifest['index.html'],html=await readFile(path.join(root,'dist/index.html'),'utf8');
if(!entry?.isEntry||!html.includes(`src="./${entry.file}"`)||!(entry.css||[]).every(file=>html.includes(`href="./${file}"`)))
 throw new Error('Built entry page references stale bundles. Clean dist and rebuild before publishing.');
const files=new Set(['index.html','favicon.svg','redline-logo.png']);
for(const entry of Object.values(manifest)){
 files.add(entry.file);
 for(const file of [...entry.css||[],...entry.assets||[]])files.add(file);
}
// Keep recent hashed assets: Pages may serve a cached entry page during an update.
const allowed=file=>typeof file==='string'&&!file.includes('..')&&!path.isAbsolute(file)&&
 (['index.html','favicon.svg','redline-logo.png'].includes(file)||/^assets\/[\w.-]+\.(js|css|glb|bin|wasm|png|svg|webp)$/.test(file));
let previous=[];
try{previous=JSON.parse(await readFile(path.join(root,'.release-manifest.json'),'utf8'));}catch{}
let history=[];
try{history=JSON.parse(await readFile(path.join(root,'.release-history.json'),'utf8'));}catch{}
const generations=Array.isArray(history)?history.filter(Array.isArray):[];
const prior=previous.filter(file=>allowed(file)&&file.startsWith('assets/')).sort();
const current=[...files].filter(file=>file.startsWith('assets/')).sort();
if(JSON.stringify(prior)!==JSON.stringify(current)&&prior.length)generations.unshift(prior);
const retained=generations.slice(0,2).map(files=>files.filter(file=>allowed(file)&&file.startsWith('assets/')));
const keep=new Set([...files,...retained.flat()]);
for(const file of files){
 if(!allowed(file))throw new Error(`Unsafe release path: ${file}`);
 await mkdir(path.dirname(path.join(root,file)),{recursive:true});
 await copyFile(path.join(root,'dist',file),path.join(root,file));
}
for(const file of new Set([...previous,...generations.flat()]))if(allowed(file)&&!keep.has(file))await rm(path.join(root,file),{force:true});
await writeFile(path.join(root,'.release-manifest.json'),JSON.stringify([...files].sort(),null,2)+'\n');
await writeFile(path.join(root,'.release-history.json'),JSON.stringify(retained,null,2)+'\n');
await writeFile(path.join(root,'.nojekyll'),'');
console.log(`Published ${files.size} current build files to repository root.`);
