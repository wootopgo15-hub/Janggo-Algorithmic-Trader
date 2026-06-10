const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(/res\.status\(500\)\.json\({ error: error\.message }\);/g, `
    let errorMsg = error.message;
    if (error.response && error.response.data) {
      errorMsg = typeof error.response.data === "object" ? JSON.stringify(error.response.data) : error.response.data;
    }
    res.status(500).json({ error: errorMsg });
`.trim());

fs.writeFileSync('server.ts', content);
