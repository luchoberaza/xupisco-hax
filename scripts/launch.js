const { execSync } = require('child_process');
const electronPath = require('electron');
const appDir = require('path').join(__dirname, '..');

execSync(
  `start "" /B "${electronPath}" "${appDir}"`,
  { windowsHide: true, stdio: 'ignore', shell: true }
);
