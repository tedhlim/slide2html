import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

// Manually load API key from .env.local
const envFile = fs.readFileSync('.env.local', 'utf8');
const apiKeyMatch = envFile.match(/GEMINI_API_KEY=["']?([^"'\s]+)["']?/);
const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;

if (!apiKey) {
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function listModels() {
  console.log('Fetching available models for your API key...');
  try {
    const response = await ai.models.list();
    // In @google/genai, the response is often an object with a models property or an array itself
    const models = Array.isArray(response) ? response : (response.models || []);
    console.log('\nAvailable Models:');
    models.forEach(m => console.log(`- ${m.name}`));
  } catch (error) {
    console.error('Failed to list models:', error.stack);
  }
}

listModels();
