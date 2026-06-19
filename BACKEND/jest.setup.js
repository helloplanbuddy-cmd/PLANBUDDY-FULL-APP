const path = require('path');
const planbuddyRoot = path.resolve(__dirname, 'planbuddy_v9');

if (process.cwd() !== planbuddyRoot) {
  process.chdir(planbuddyRoot);
}
