import {tr} from './i18n.js';
import {$, ext} from './store.js';
import {is3D, setView} from './main.js';

/* ======================= 导入导出 ======================= */
export function download(name, blob){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
/** 导出图片：2D → 平面方案展示图；3D → 效果图（高清重渲染 + 与平面展示图一致的标题栏） */
export async function exportPNG(){
  toast(tr('正在生成高清图…', 'Rendering high-res image…'));
  await new Promise(r => setTimeout(r, 30));
  const X = await import('./exporter.js');
  if (is3D()) X.export3DSheet(ext.View3D.capture(), download);
  else await X.exportPlanSheet(download);
}
/** 导出 VR 看房：每个房间一张 360° 全景 + 门口热点切换，打包成单个 HTML */
export async function exportVR(){
  if (!is3D()) await setView('3d');
  if (!ext.View3D) return;
  await ext.View3D.exportVR(download, toast);
}

/* ======================= 杂项 ======================= */
export let toastT;
export function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); }

