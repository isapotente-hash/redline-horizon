import test from 'node:test';import assert from 'node:assert/strict';import {readFile,stat,mkdtemp,mkdir,writeFile,copyFile,rm} from 'node:fs/promises';import {createHash} from 'node:crypto';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
const root=new URL('../dist/',import.meta.url),manifest=JSON.parse(await readFile(new URL('.vite/manifest.json',root)));
test('web entry is small and every built resource resolves without embedded model/physics bytes',async()=>{
 const html=await readFile(new URL('index.html',root),'utf8');assert.ok(Buffer.byteLength(html)<5000);assert.match(html,/startup-bar/);assert.match(html,/startup-percent/);
 const entry=manifest['index.html'];assert.ok(entry?.isEntry);assert.ok(html.includes(`src="./${entry.file}"`),'HTML must load the current entry bundle');
 for(const css of entry.css||[])assert.ok(html.includes(`href="./${css}"`),'HTML must load the current stylesheet');
 let scriptBytes=0,models=0,wasm=0;const parts=[];
 for(const entry of Object.values(manifest)){
  const file=new URL(entry.file,root),bytes=await readFile(file);
  for(const ref of [...entry.imports||[],...entry.dynamicImports||[]])assert.ok(manifest[ref],ref);
  for(const resource of [...entry.css||[],...entry.assets||[]])assert.ok((await stat(new URL(resource,root))).size>0);
  if(entry.file.endsWith('.js')){scriptBytes+=bytes.length;assert.doesNotMatch(bytes.toString(),/data:[^,]+;base64,[A-Za-z0-9+/=]{100000}/);assert.doesNotMatch(bytes.toString(),/AGFzbQE[A-Za-z0-9+/=]{100000}/);}
  if(entry.file.endsWith('.glb')){models++;assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);const name=entry.file.split('/').at(-1).split('-')[0],original=await readFile(new URL('../assets/'+(name==='RACER'?'characters/':'cars/')+name+'.glb',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(original).digest('hex'));}
  const part=entry.file.match(/racer-(\d+)-[^/]+\.bin$/);if(part)parts[Number(part[1])]=bytes;
  if(entry.file.endsWith('.wasm')){wasm++;assert.ok(WebAssembly.validate(bytes));}
 }
 assert.equal(parts.length,30);assert.ok(parts.every(Boolean));const reconstructed=Buffer.concat(parts),originalRacer=await readFile(new URL('../assets/characters/RACER.glb',import.meta.url));assert.deepEqual(reconstructed,originalRacer);models++;assert.equal(models,4);assert.equal(wasm,1);assert.ok(scriptBytes<1500000,`JS unexpectedly large: ${scriptBytes}`);console.log({entryBytes:Buffer.byteLength(html),scriptBytes,models,wasm});
});
test('stale build entry cannot overwrite the published page',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'redline-publish-'));
 try{
  await mkdir(join(folder,'scripts'));await mkdir(join(folder,'dist/.vite'),{recursive:true});
  await copyFile(new URL('publish-root.mjs',import.meta.url),join(folder,'scripts/publish-root.mjs'));
  await writeFile(join(folder,'index.html'),'published page');
  await writeFile(join(folder,'dist/.vite/manifest.json'),JSON.stringify({'index.html':{isEntry:true,file:'assets/current.js',css:['assets/current.css']}}));
  await writeFile(join(folder,'dist/index.html'),'<script src="./assets/old.js"></script><link href="./assets/old.css">');
  const result=spawnSync(process.execPath,[join(folder,'scripts/publish-root.mjs')],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/stale bundles/);assert.equal(await readFile(join(folder,'index.html'),'utf8'),'published page');
 }finally{await rm(folder,{recursive:true,force:true});}
});
