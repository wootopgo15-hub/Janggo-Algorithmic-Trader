const { execSync } = require('child_process');
execSync('git checkout server.ts');
console.log('Restored!');
