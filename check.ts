import axios from 'axios';
async function run() {
  const res = await axios.get('https://bitgetlimited.github.io/apidoc/en/mix/');
  const t = res.data;
  const lines = t.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('preset')) {
      console.log(lines[i]);
    }
  }
}
run();
