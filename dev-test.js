const { spawn } = require('child_process');
const path = require('path');

// 启动 Electron 应用
const electronProcess = spawn('electron', [path.join(__dirname, 'out/main/index.js')], {
  stdio: 'inherit'
});

electronProcess.on('close', (code) => {
  console.log(`Electron 应用退出，退出码: ${code}`);
});

electronProcess.on('error', (error) => {
  console.error('启动 Electron 失败:', error);
});