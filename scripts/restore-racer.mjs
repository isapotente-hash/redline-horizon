import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const folder=new URL('../assets/characters/',import.meta.url),parts=[];
for(let i=0;i<30;i++)parts.push(await readFile(new URL('racer-parts/racer-'+String(i).padStart(2,'0')+'.bin',folder)));
const data=Buffer.concat(parts);if(data.length!==3580584||createHash('sha256').update(data).digest('hex')!=='ef125e4ab4256ded21875e3bef86de09608e78c1034065b6370b59b6030b6d15')throw Error('Racer model parts failed integrity check');
await writeFile(new URL('RACER.glb',folder),data);
