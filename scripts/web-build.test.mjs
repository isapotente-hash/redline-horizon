import test from 'node:test';import assert from 'node:assert/strict';import {readFile,stat} from 'node:fs/promises';import {createHash} from 'node:crypto';
const root=new URL('../dist/',import.meta.url),manifest=JSON.parse(await readFile(new URL('.vite/manifest.json',root)));
test('web entry is small and every built resource resolves without embedded model/physics bytes',async()=>{
 const html=await readFile(new URL('index.html',root),'utf8');assert.ok(Buffer.byteLength(html)<5000);assert.match(html,/startup-bar/);assert.match(html,/startup-percent/);
 let scriptBytes=0,models=0,wasm=0;
 for(const entry of Object.values(manifest)){
  const file=new URL(entry.file,root),bytes=await readFile(file);
  for(const ref of [...entry.imports||[],...entry.dynamicImports||[]])assert.ok(manifest[ref],ref);
  for(const resource of [...entry.css||[],...entry.assets||[]])assert.ok((await stat(new URL(resource,root))).size>0);
  if(entry.file.endsWith('.js')){scriptBytes+=bytes.length;assert.doesNotMatch(bytes.toString(),/data:[^,]+;base64,[A-Za-z0-9+/=]{100000}/);assert.doesNotMatch(bytes.toString(),/AGFzbQE[A-Za-z0-9+/=]{100000}/);}
  if(entry.file.endsWith('.glb')){models++;assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);const name=entry.file.split('/').at(-1).split('-')[0],original=await readFile(new URL('../assets/cars/'+name+'.glb',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(original).digest('hex'));}
  if(entry.file.endsWith('.wasm')){wasm++;assert.ok(WebAssembly.validate(bytes));}
 }
 assert.equal(models,3);assert.equal(wasm,1);assert.ok(scriptBytes<1500000,`JS unexpectedly large: ${scriptBytes}`);console.log({entryBytes:Buffer.byteLength(html),scriptBytes,models,wasm});
});
