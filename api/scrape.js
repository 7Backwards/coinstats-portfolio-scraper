import chromium from 'chrome-aws-lambda';

export const config = {
  runtime: 'edge'
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { url } = await req.json();
    
    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    await page.waitForSelector('.AssetsTable_csTableCell__Dobto');

    const coins = await page.evaluate(() => {
      const coinRows = document.querySelectorAll('.CSTableWrapper_csTableRow__SpSQy');
      return Array.from(coinRows).map(row => {
        const symbol = row.querySelector('.AssetsTableCoinBadgeMobile_symbol__5sEFQ')?.textContent;
        const amount = row.querySelector('.AssetsTableCoinBadgeMobile_amount__8QDiR')?.textContent;
        
        if (symbol && amount) {
          return {
            symbol: symbol.trim(),
            amount: parseFloat(amount.trim())
          };
        }
        return null;
      }).filter(item => item !== null);
    });

    await browser.close();
    
    return new Response(JSON.stringify(coins), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.toString() }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}