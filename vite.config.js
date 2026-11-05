import {defineConfig} from 'vite';

export default defineConfig({
  base: './',                       // 产物可直接部署到任意子路径（如 GitHub Pages）
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // three.js 单独成包，长期缓存；只在进入 3D 时加载
        manualChunks: id => id.includes('node_modules/three') ? 'three' : undefined,
      },
    },
  },
});
