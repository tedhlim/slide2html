import fs from 'fs';

// Manually load API key from .env.local for this test script
const envFile = fs.readFileSync('.env.local', 'utf8');
const apiKeyMatch = envFile.match(/ANTHROPIC_API_KEY=["']?([^"'\s]+)["']?/);
const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;

if (!apiKey) {
  console.error('❌ Error: ANTHROPIC_API_KEY not found in .env.local');
  process.exit(1);
}

console.log('--- Slide.html Anthropic connectivity test ---');
console.log('Using API Key ending in:', apiKey.slice(-4));

async function runTest() {
  console.log('Sending test request to Anthropic (Claude)...');
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ 
          role: 'user', 
          content: 'Write a single line of Tailwind CSS HTML for a blue button that says "Test Success".' 
        }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '';

    console.log('\n✅ Claude Response Received:');
    console.log('------------------------');
    console.log(text);
    console.log('------------------------');
    console.log('\nConnectivity test PASSED.');
  } catch (error) {
    console.error('\n❌ AI Request FAILED:');
    console.error(error.message);
  }
}

runTest();
