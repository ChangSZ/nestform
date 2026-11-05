// 应用入口：2D 编辑器（样式在 index.html 的 <head> 里同步加载；3D 模块由 main.js 按需动态加载）
// 以下模块在顶层注册事件监听（副作用模块），必须显式引入
import './plan2d/pointer.js';
import './ui/library.js';
import './keyboard.js';
import {boot} from './main.js';

boot();
