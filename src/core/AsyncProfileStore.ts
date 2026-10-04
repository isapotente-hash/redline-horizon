/** Disk-backed checkpoints without synchronous localStorage writes in the frame loop. */
export interface AsyncProfileStore {
  read():Promise<unknown>;
  write(profile:unknown):Promise<void>;
}
export class IndexedDBProfileStore implements AsyncProfileStore {
  private database?:Promise<IDBDatabase>;
  private open(){
    if(this.database)return this.database;
    this.database=new Promise<IDBDatabase>((resolve,reject)=>{
      if(typeof indexedDB==='undefined'){reject(new Error('Asynchronous storage unavailable'));return;}
      const request=indexedDB.open('redline-horizon-checkpoints',1);
      let failed=false;
      const timer=setTimeout(()=>{failed=true;reject(new Error('Checkpoint database blocked'));},1500);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('profiles'))request.result.createObjectStore('profiles');};
      request.onerror=()=>{failed=true;clearTimeout(timer);reject(request.error);};
      request.onblocked=()=>{failed=true;clearTimeout(timer);reject(new Error('Checkpoint database blocked'));};
      request.onsuccess=()=>{clearTimeout(timer);const db=request.result;if(failed){db.close();return;}db.onversionchange=()=>{db.close();this.database=undefined;};resolve(db);};
    });
    // A transient blocked/failed open must not disable every later checkpoint.
    this.database=this.database.catch(error=>{this.database=undefined;throw error;});
    return this.database;
  }
  async read(){
    const db=await this.open();
    return new Promise<unknown>((resolve,reject)=>{
      const transaction=db.transaction('profiles','readonly'),request=transaction.objectStore('profiles').get('current');
      transaction.oncomplete=()=>resolve(request.result??null);
      transaction.onabort=transaction.onerror=()=>reject(transaction.error);
    });
  }
  async write(profile:unknown){
    const db=await this.open();
    return new Promise<void>((resolve,reject)=>{
      const transaction=db.transaction('profiles','readwrite');
      transaction.objectStore('profiles').put(profile,'current');
      transaction.oncomplete=()=>resolve();
      transaction.onabort=transaction.onerror=()=>reject(transaction.error);
    });
  }
}
