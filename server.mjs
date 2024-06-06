import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Anthropic } from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';

dotenv.config();

puppeteer.use(StealthPlugin());

const app = express();
const port1 = process.env.PORT || 5000;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = new Anthropic(anthropicApiKey);

app.use(bodyParser.json());
app.use(cors());

// Ensure the ANTHROPIC_API_KEY is set
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("Anthropic API key not set in environment variables. Set the ANTHROPIC_API_KEY environment variable.");
}

async function image_to_base64(imageFile) {
  try {
    const data = await fs.readFile(imageFile);
    const base64Data = data.toString('base64').replace(/\r?\n|\r/g, '');
    return base64Data;
  } catch (err) {
    console.error('Error reading the file:', err);
    throw err;
  }
}

(async () => {

  app.post('/chat', async (req, res) => {
    const userPrompt = req.body.message;
    const url = extractUrl(userPrompt);
    let message_text = "No response";

    if (url) {
      const browser = await puppeteer.launch({ headless: "new" });
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 1200, deviceScaleFactor: 1.75 });

      const systemMessage = `You are a website crawler...`;

      let screenshot_taken = false;
      let base64_image;

      if (url) {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await highlight_links(page);
        await Promise.race([waitForEvent(page, 'load'), sleep(3500)]); // Assuming 3.5 seconds as the timeout
        await highlight_links(page);
        await page.screenshot({ path: "screenshot.jpg", quality: 100 });
        screenshot_taken = true;
      }

      if (screenshot_taken) {
        base64_image = await image_to_base64("screenshot.jpg");
      }

      if (base64_image) {
        const response = await anthropic.messages.create({
          model: "claude-3-opus-20240229",
          max_tokens: 1024,
          system: systemMessage,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: userPrompt
                },
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: base64_image
                  }
                }
              ]
            }
          ]
        });

        message_text = response.content[0].text;
        message_text = message_text.replace(/\\n/g, '\n');

        try {

          await fs.appendFile('Knowledge Base/knowledge_base.txt', message_text + '\n');
          console.log('Response appended to knowledge_base.txt');

          // Send a request to reconstruct the index
          const reconstructResponse = await fetch("http://localhost:5002/reconstruct_index", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (!reconstructResponse.ok) {
            console.error("Error occurred while reconstructing the index:", reconstructResponse.statusText);
          } else {
            console.log("Index reconstruction triggered successfully.");
          }

        } catch (err) {
          console.error('Error writing to file:', err);
        }
      }

      await browser.close();

    } else {

      console.log("Entering else block");

      try {

        // Use the query API to get the answer to the user's question
        const queryResponse = await fetch("http://localhost:5002/query", {

          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: userPrompt
          }),

        });

        if (queryResponse.ok) {

          const data = await queryResponse.json();
          const kbResponse = data.results.join(' '); // Assuming results is an array of strings
          message_text = kbResponse;

        } else {
          console.error("Error occurred while querying the knowledge base:", queryResponse.statusText);
        }

      } catch (error) {
        console.error("Error in else block:", error);
        res.status(500).send({ error: 'An error occurred while processing your request.' });
        return;
      }
    }

    res.send({ role: 'assistant', content: message_text });

  });

  app.listen(port1, () => {
    console.log(`Server for Retrieval-Augmented Generation model is running on http://localhost:${port1}`);
  });

})();    

// Helper functions for extracting URL, sleeping, highlighting links, and waiting for events
function extractUrl(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches ? matches[0] : null;
}

async function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function highlight_links(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[claude-link-text]').forEach(e => {
      e.removeAttribute("claude-link-text");
    });
  });

  const elements = await page.$$(
    "a, button, input, textarea, [role=button], [role=treeitem]"
  );

  elements.forEach(async e => {
    await page.evaluate(e => {
      function isStyleVisible(el) {
        const style = window.getComputedStyle(el);
        return style.width !== '0' &&
          style.height !== '0' &&
          style.opacity !== '0' &&
          style.display !== 'none' &&
          style.visibility !== 'hidden';
      }

      function isElementInViewport(el) {
        const rect = el.getBoundingClientRect();
        return (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
      }

      function isElementVisible(el) {
        if (!el) return false;

        if (!isStyleVisible(el)) {
          return false;
        }

        let parent = el;
        while (parent) {
          if (!isStyleVisible(parent)) {
            return false;
          }
          parent = parent.parentElement;
        }

        return isElementInViewport(el);
      }

      e.style.border = "1px solid red";

      const position = e.getBoundingClientRect();

      if (position.width > 5 && position.height > 5 && isElementVisible(e)) {
        const link_text = e.textContent.replace(/[^a-zA-Z0-9 ]/g, '');
        e.setAttribute("claude-link-text", link_text);
      }
    }, e);
  });
}

async function waitForEvent(page, event) {
  return page.evaluate(event => {
    return new Promise((resolve) => {
      document.addEventListener(event, function () {
        resolve();
      });
    });
  }, event);
}
