const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

app.post('/api/scrape', async (req, res) => {
  let browser;
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

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
    
    console.log('Loading page...');
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 5000 });
    
    console.log('Waiting for data to load...');
    await delay(1000);

    const data = await page.evaluate(() => {
      const text = document.body.textContent;
      const coins = [];
      
      const regex = /([A-Za-z\s]+)•\s*([A-Z]+)\s*([\d.]+)/g;
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        const [_, name, symbol, amount] = match;
        if (amount && !isNaN(parseFloat(amount))) {
          coins.push({
            name: name.trim(),
            symbol: symbol.trim(),
            amount: parseFloat(amount)
          });
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
});

// Get the port from environment variable
const port = process.env.PORT || 3000;

// Listen on all network interfaces
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});