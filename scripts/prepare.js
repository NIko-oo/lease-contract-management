// 安装时挂上仓库自带的 git hooks；非 git 目录或 Windows 环境失败时静默跳过。
const { execSync } = require('child_process');
const fs = require('fs');

try {
  fs.chmodSync('.githooks/pre-commit', 0o755);
} catch {}

try {
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
} catch {}
