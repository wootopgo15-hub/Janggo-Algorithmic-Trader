const axios = require('axios');
axios.get("https://raw.githubusercontent.com/bitget-api/bitget-node-sdk-api/master/src/lib/mix/MixOrderApi.ts")
  .then(res => {
    const lines = res.data.split("\n").filter(l => l.toLowerCase().includes("preset"));
    console.log(lines.join("\n"));
  }).catch(e => console.error(e.message));
