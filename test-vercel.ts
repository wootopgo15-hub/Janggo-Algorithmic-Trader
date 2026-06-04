import express from 'express';
const app = express();
app.post('/', (req, res) => {
  res.json({ bodyType: typeof req.body, body: req.body });
});

// Mock Vercel req/res
const req: any = {
  method: 'POST',
  url: '/',
  body: { side: "LONG", symbol: "BTCUSDT", amount: "15" },
  headers: {}
};
const res: any = {
  json: console.log,
  setHeader: () => {},
  end: () => {}
};

app(req, res);
