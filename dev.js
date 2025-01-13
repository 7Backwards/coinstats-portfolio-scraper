const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

let lastRequestTime = 0;
const ONE_MINUTE = 60000;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

app.post('/api/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const currentTime = Date.now();
    const timeElapsed = currentTime - lastRequestTime;
    
    if (timeElapsed < ONE_MINUTE) {
      const waitSeconds = Math.ceil((ONE_MINUTE - timeElapsed) / 1000);
      return res.status(429).json({
        error: `Rate limit exceeded. Please wait ${waitSeconds} seconds before trying again.`
      });
    }

    lastRequestTime = currentTime;

    let browser;
    try {
      const config = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
      };

      console.log('Launching browser...');
      browser = await puppeteer.launch(config);

      const page = await browser.newPage();
      await page.setDefaultNavigationTimeout(60000);

      console.log('Loading page...');
      await page.goto(url, { 
        waitUntil: 'networkidle0',
        timeout: 60000 
      });

      console.log('Waiting for data to load...');

      const text = await page.evaluate(() => document.body.textContent);
      
      const data = await page.evaluate(() => {
        const text = document.body.innerText;
        const coins = [];
        const regex = /([A-Za-z\s]+)•\s*([A-Z]+)\s*([\d,]+(?:\.?\d{0,3})?)/g;
        let match;
      
        while ((match = regex.exec(text)) !== null) {
          const [_, name, symbol, amount] = match;
          if (amount) {
            const cleanAmount = amount.replace(/,/g, '');
            const parsedAmount = parseFloat(cleanAmount);
      
            if (!isNaN(parsedAmount)) {
              coins.push({
                name: name.trim(),
                symbol: symbol.trim(),
                amount: parsedAmount
              });
            }
          }
        }
      
        return coins;
      });

      console.log('Extracted data:', data);
      await browser.close();
      res.json(data);

    } catch (error) {
      console.error('Error:', error);
      if (browser) {
        await browser.close();
      }
      res.status(500).json({ error: error.toString() });
    }

  } catch (error) {
    console.error('Outer Error:', error);
    res.status(500).json({ error: error.toString() });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});