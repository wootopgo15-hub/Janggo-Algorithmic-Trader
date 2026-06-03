import http from 'https';

http.get('https://bitgetlimited.github.io/apidoc/en/mix/order/place-order.html', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    lines.forEach((line) => {
      if (line.toLowerCase().includes('preset')) {
        console.log(line.trim());
      }
    });
  });
}).on('error', (err) => {
  console.log('Error: ' + err.message);
});
