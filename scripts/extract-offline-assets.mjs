import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const input=process.argv[2];if(!input)throw Error('Pass the saved single-file HTML path.');
const html=await readFile(input,'utf8'),sha=b=>createHash('sha256').update(b).digest('hex'),known=new Map();
for(const name of ['VANTA_R1','REVUELTO','MOTORCYCLE'])known.set(sha(await readFile(`assets/cars/${name}.glb`)),name);
const out=process.argv[3]||'extracted-assets';await mkdir(out,{recursive:true});const manifest=[];
for(const match of html.matchAll(/data:([^;,]+);base64,([A-Za-z0-9+/=]+)/g)){
 const bytes=Buffer.from(match[2],'base64'),hash=sha(bytes),name=known.get(hash);
 if(name){await writeFile(`${out}/${name}.glb`,bytes);manifest.push({file:name+'.glb',bytes:bytes.length,sha256:hash});}
}
if(new Set(manifest.map(a=>a.file)).size!==3)throw Error('Expected exactly the three original embedded GLB assets.');
await writeFile(`${out}/manifest.json`,JSON.stringify({sourceSha256:sha(html),assets:manifest},null,2));console.log(manifest);
