const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

// Flag to track if a scraping operation is in progress
let isScrapingInProgress = false;
let lastScrapeTime = 0;
const COOLDOWN_PERIOD = 5000; // 5 seconds cooldown between requests

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

app.post('/api/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check if scraping is already in progress
    if (isScrapingInProgress) {
      return res.status(429).json({ 
        error: 'A scraping operation is already in progress. Please try again later.' 
      });
    }

    // Check cooldown period
    const currentTime = Date.now();
    const timeSinceLastScrape = currentTime - lastScrapeTime;
    if (timeSinceLastScrape < COOLDOWN_PERIOD) {
      const waitTime = COOLDOWN_PERIOD - timeSinceLastScrape;
      return res.status(429).json({
        error: `Please wait ${Math.ceil(waitTime / 1000)} seconds before making another request`
      });
    }

    // Set scraping flag and update last scrape time
    isScrapingInProgress = true;
    lastScrapeTime = currentTime;

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
      
      // Set longer timeout for navigation
      await page.setDefaultNavigationTimeout(30000);

      console.log('Loading page...');
      await page.goto(url, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });

      console.log('Waiting for data to load...');
      await delay(1000);

      const data = await page.evaluate(() => {
        const text = document.body.textContent;
        const coins = [];

        const regex = /([A-Za-z\s]+)•\s*([A-Z]+)\s*([\d,]+\.?\d*)/g;
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
    } finally {
      // Always reset the scraping flag, even if an error occurred
      isScrapingInProgress = false;
    }

  } catch (error) {
    console.error('Outer Error:', error);
    // Reset flag in case of unexpected errors
    isScrapingInProgress = false;
    res.status(500).json({ error: error.toString() });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});