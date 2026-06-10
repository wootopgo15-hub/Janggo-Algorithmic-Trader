const fs = require('fs');

const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

const resetOld = `                  <button
                    onClick={() => {
                      setLogs([]);
                    }}`;

const resetNew = `                  <button
                    onClick={() => {
                      setLogs([]);
                      if (isPaperTrading) {
                        setPaperBalance(10000);
                        setPaperPositions([]);
                      }
                    }}`;

content = content.replace(resetOld, resetNew);

fs.writeFileSync(file, content);
