const fs = require('fs');

const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add state for paper positions and balance
content = content.replace(
  'const [isPaperTrading, setIsPaperTrading] = useState(true);',
  `const [isPaperTrading, setIsPaperTrading] = useState(true);
  const [paperBalance, setPaperBalance] = useState(() => {
    const saved = localStorage.getItem("janggo_paper_balance");
    return saved ? parseFloat(saved) : 10000;
  });
  const [paperPositions, setPaperPositions] = useState<any[]>(() => {
    const saved = localStorage.getItem("janggo_paper_positions");
    return saved ? JSON.parse(saved) : [];
  });`
);

// Add useEffects to save paper data
const useEffectTarget = `  useEffect(() => {
    localStorage.setItem("janggo_trade_stats", JSON.stringify(stats));
  }, [stats]);`;

content = content.replace(
  useEffectTarget,
  `${useEffectTarget}

  useEffect(() => {
    localStorage.setItem("janggo_paper_balance", paperBalance.toString());
  }, [paperBalance]);

  useEffect(() => {
    localStorage.setItem("janggo_paper_positions", JSON.stringify(paperPositions));
  }, [paperPositions]);
`
);

// Short-circuit fetchBalance if isPaperTrading
content = content.replace(
  'const fetchBalance = async (isFirstView: boolean = false) => {',
  `const fetchBalance = async (isFirstView: boolean = false) => {
    if (isPaperTrading) {
      if (isFirstView) setLoading(false);
      return;
    }`
);

fs.writeFileSync(file, content);
