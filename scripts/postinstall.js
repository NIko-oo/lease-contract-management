#!/usr/bin/env node
// 妙搭能力插件初始化。fullstack-cli 只在妙搭沙箱内提供，
// 本地 / 开源环境没有该命令时跳过，不阻断 npm install。
const { spawnSync } = require('child_process');

const result = spawnSync('fullstack-cli', ['action-plugin', 'init'], {
  stdio: 'inherit',
  shell: true,
});

if (result.error || result.status !== 0) {
  console.warn('[postinstall] 未找到 fullstack-cli，跳过插件初始化（妙搭沙箱内会由平台执行）');
}

process.exit(0);
