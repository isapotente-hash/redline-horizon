import {defineConfig} from 'vite';
import path from 'node:path';
export default defineConfig(({mode})=>{
  const offline=mode==='offline';
  return {
    root:'web',publicDir:'../public',base:'./',
    server:{host:'0.0.0.0',port:4173,strictPort:true,allowedHosts:true,fs:{allow:['..']}},
    plugins:offline?[]:[{
      name:'external-rapier-wasm',enforce:'pre' as const,
      transform(code:string,id:string){
        if(!id.endsWith('/@dimforge/rapier3d-compat/rapier.mjs'))return;
        // Pin checked against 0.19.0: retain official bindings, externalize only its WASM bytes.
        const pattern=/Lg\.toByteArray\("AGFzb[^"]+"\)\.buffer/;
        if(!pattern.test(code))throw new Error('Rapier bundle format changed; update the external WASM transform.');
        const url=JSON.stringify(path.resolve('node_modules/@dimforge/rapier3d-compat/rapier_wasm3d_bg.wasm')+'?url');
        return 'import rapierWasmURL from '+url+';\n'+code.replace(pattern,'{module_or_path:rapierWasmURL}');
      }
    }],
    build:{manifest:true,outDir:'../dist',emptyOutDir:true,target:'es2022',assetsInlineLimit:offline?12000000:0,chunkSizeWarningLimit:1600,
      rollupOptions:{output:{
        assetFileNames:'assets/[name]-[hash][extname]',
        manualChunks:offline?undefined:(id:string)=>id.includes('/node_modules/three/')?'three':id.includes('/node_modules/@dimforge/')?'physics':undefined,
      }}
    }
  };
});
