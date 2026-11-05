/* 导入户型图的底图（原始图片）—— 单独存 localStorage，不进撤销栈（避免每步快照都复制几百 KB 图片） */
const KEY = 'nestform-underlay';
let cache;
export function getUnderlay(id){
  if (cache === undefined){ try { cache = JSON.parse(localStorage.getItem(KEY)); } catch(e) { cache = null; } }
  return cache && cache.id === id ? cache.src : null;
}
export function setUnderlay(id, src){
  cache = {id, src};
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch(e) { /* 超出配额：仅本次会话可见 */ }
}
