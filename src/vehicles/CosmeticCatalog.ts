export const LIVERIES=[{id:'factory',name:'Factory',price:0},{id:'stripe',name:'Centre stripe',price:100},{id:'twin',name:'Twin stripes',price:180},{id:'race',name:'Competition',price:260}] as const;
export type Livery=typeof LIVERIES[number]['id'];
export const validLivery=(v:unknown):v is Livery=>LIVERIES.some(l=>l.id===v);
export const cleanPlate=(v:unknown)=>typeof v==='string'?v.toUpperCase().replace(/[^A-Z0-9 -]/g,'').slice(0,8):'REDLINE';
