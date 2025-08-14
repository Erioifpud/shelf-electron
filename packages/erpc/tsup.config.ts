import { defineConfig } from 'tsup';
import sharedConfig from '../../tsup.config.shared';

export default defineConfig({
  entry: ['src/index.ts'],
  ...sharedConfig,
});

/*
export default defineConfig({
  entry: ['src/index.ts'], // 入口
  format: ['esm'],         // 生成 ESM
  platform: 'browser',     // 浏览器环境
  target: 'es2020',        // 目标 JS 版本
  splitting: false,        // 不拆分代码，生成单文件
  bundle: true,            // 开启打包
  //minify: true,            // 压缩
  //sourcemap: false,        // 如果需要调试可以设为 true
  clean: true,             // 每次清理 dist
  noExternal: ['@eleplug/mimic', '@eleplug/transport', 'circular_buffer_js', 'lodash-es', 'uuid'],
  dts: false               // 如果需要类型声明，可以单独开 dts 任务
});
*/