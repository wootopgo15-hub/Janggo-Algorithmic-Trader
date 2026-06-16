import puppeteer from 'puppeteer';

(async () => {
    try {
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        page.on('console', msg => {
            console.log('LOG:', msg.text());
        });
        page.on('pageerror', err => console.log('PAGE_ERROR:', err.toString()));
        
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
        
        await new Promise(r => setTimeout(r, 2000));

        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const liveBtn = btns.find(b => b.innerText.includes('LIVE'));
            if (liveBtn) liveBtn.click();
        });

        await new Promise(r => setTimeout(r, 2000));
        
        await browser.close();
    } catch (e) {
        console.error("Puppeteer crashed:", e.toString());
    }
})();
