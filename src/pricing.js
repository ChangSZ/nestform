/* =====================================================================
 *  市场参考价（data/prices/market-prices.json，来源与口径见同目录 SOURCES.md）
 *  - 所有价格都是「低–高」区间，单位 CNY；材料不含人工的，自动叠加对应的施工 / 铺贴人工项
 *  - 定制柜按投影面积（宽 × 高）计价；橱柜按延米；家电按件
 * ===================================================================== */
import RAW from '../data/prices/market-prices.json';
import {tr} from './i18n.js';

const BY = Object.fromEntries(RAW.items.map(i => [i.key, i]));
export const PRICE_DATE = RAW.retrieved;

/** 地面 / 墙面材质 → [主材条目, 人工条目…]；extra 为来源里注明的附加费用（无独立条目时） */
const MAT_MAP = {
  wood:['floor_engineered_3layer', {low:20, high:75, name:'地板安装（另计）', of:'floor_engineered_3layer'}],
  greywood:['floor_engineered_multilayer', {low:20, high:75, name:'地板安装（另计）', of:'floor_engineered_multilayer'}],
  walnut:['floor_solid_wood'], bamboo:['floor_bamboo'], chevron:['floor_herringbone', 'floor_herringbone_install'],
  tile800:['tile_800x800', 'tile_labor_floor'], tile600:['tile_600x600', 'tile_labor_floor'], checker:['tile_600x600', 'tile_labor_floor'],
  slab:['tile_slab_900x1800', 'tile_labor_large_slab'], marble:['stone_marble_natural', 'tile_labor_marble'],
  antislip:['tile_300x300_antislip', 'tile_labor_floor'], encaustic:['tile_vintage_encaustic', 'tile_labor_floor'],
  terrazzo:['floor_terrazzo_cast'], microcement:['floor_microcement'], carpet:['floor_carpet_wall_to_wall'],
  paint_white:['wall_paint_latex'], paint_warm:['wall_paint_latex'], paint_grey:['wall_paint_latex'], paint_blue:['wall_paint_latex'], paint_sage:['wall_paint_latex'], paint_latte:['wall_paint_latex'],
  wallpaper:['wallpaper'], wp_floral:['wallpaper'], wp_geo:['wallpaper'], wp_damask:['wallpaper'], wp_leaf:['wallpaper'], wp_plaid:['wallpaper'], wp_star:['wallpaper'], wp_linen:['wall_fabric_seamless'],
  woodpanel:['wall_wood_veneer_finished'], walltile:['tile_300x600_wall', 'tile_labor_wall'], marblewall:['stone_marble_natural', 'wall_marble_install'],
  brick:['wall_culture_brick', {low:65, high:85, name:'文化砖铺贴人工', of:'wall_culture_brick'}],
};
const resolve = parts => parts.map(p => typeof p === 'string' ? BY[p] : p).filter(Boolean);

/** 材质单价（¥/m²）：{low, high, items, labor} —— labor 表示已含施工 */
export function matPrice(kind){
  const items = resolve(MAT_MAP[kind] || []);
  if (!items.length) return null;
  const low = items.reduce((a, i) => a + i.low, 0), high = items.reduce((a, i) => a + i.high, 0);
  return {low, high, items, labor:items.some(i => i.includes_labor || i.of)};
}

/** 定制柜 / 橱柜 / 家电的参考价：{low, high, qty, unit, items, note} 或 null */
export function furnPrice(f, ceilMM){
  const p = f.cab || {}, wm = f.w/1000;
  if (['customcab', 'tvwall', 'laundrycab'].includes(f.type)){
    const h = ((p.h || 0) > 0 ? p.h : ceilMM - (p.mount || 0))/1000, area = +(wm*h).toFixed(2);
    const key = p.pk || {tvwall:'cabinet_tv_wall', laundrycab:'cabinet_balcony'}[f.type] || (p.door === 'open' ? 'cabinet_bookcase' : 'cabinet_wardrobe');
    const base = BY[key]; if (!base) return null;
    const items = [base]; let low = base.low*area, high = base.high*area;
    if (p.door === 'glass' && BY.cabinet_glass_door_premium){ const g = BY.cabinet_glass_door_premium; items.push(g); low += g.low*area; high += g.high*area; }
    return {low, high, qty:area, unit:tr('m² 投影', 'm² projected'), items, note:tr('投影面积 = 宽 × 高；不含抽屉、拉篮、灯带等五金配件', 'Projected area = width × height; drawers, pull-outs and lights extra')};
  }
  if (f.type === 'counter'){
    const it = BY.kitchen_cabinet_linear; if (!it) return null;
    return {low:it.low*wm, high:it.high*wm, qty:+wm.toFixed(2), unit:tr('延米', 'linear m'), items:[it], note:tr('地柜 + 吊柜 + 石英石台面', 'Base + wall cabinets + quartz top')};
  }
  const ap = ['washer', 'washdryer', 'tripletub', 'twintub', 'toploader'].includes(f.type) ? 'appliance_washer_front_10kg'
    : f.type === 'washstack' ? 'appliance_washer_dryer_set'
    : (f.type === 'fridge' && f.w > 850) ? 'appliance_fridge_side_by_side'
    : ['frenchfridge', 'crossfridge'].includes(f.type) ? 'appliance_fridge_french_door' : null;
  if (ap && BY[ap]) return {low:BY[ap].low, high:BY[ap].high, qty:1, unit:tr('件', 'pc'), items:[BY[ap]], note:tr('电商到手价（含国补 / 券）', 'Online price incl. subsidies')};
  return null;
}

export const fmtMoney = v => '¥' + Math.round(v).toLocaleString();
export const fmtRange = (lo, hi) => `${fmtMoney(lo)}–${Math.round(hi).toLocaleString()}`;
export const fmtUnit = p => p ? `¥${p.low}–${p.high}` : '—';

/** 参与估算的条目 → 来源列表（去重） */
export function sourcesOf(items){
  const seen = new Map();
  for (const it of items){
    const base = it.of ? BY[it.of] : it; if (!base || seen.has(base.key)) continue;
    seen.set(base.key, base);
  }
  return [...seen.values()];
}
/** 套餐参考（只展示，不参与估算） */
export const packages = () => RAW.items.filter(i => i.category === 'package');
