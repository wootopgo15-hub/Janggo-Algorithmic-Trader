const fs = require('fs');
const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('Gamepad2,')) {
    content = content.replace('Calendar,', 'Calendar,\n  Gamepad2,');
    fs.writeFileSync(file, content);
}
