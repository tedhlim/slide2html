import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');

function getEnvValue(key) {
  const match = envFile.match(new RegExp(`${key}=["']?([^"'\\s]+)["']?`));
  return match ? match[1] : null;
}

const provider = getEnvValue('AI_PROVIDER') || 'claude';
console.log(`--- Slide.html ${provider.toUpperCase()} connectivity test ---`);

async function runClaudeTest() {
  const apiKey = getEnvValue('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('❌ Error: ANTHROPIC_API_KEY not found in .env.local');
    process.exit(1);
  }
  console.log('Using API Key ending in:', apiKey.slice(-4));
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
        model: getEnvValue('CLAUDE_MODEL') || 'claude-sonnet-4-6',
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

async function runOpenAITest() {
  const apiKey = getEnvValue('OPENAI_API_KEY');
  if (!apiKey) {
    console.error('❌ Error: OPENAI_API_KEY not found in .env.local');
    process.exit(1);
  }
  console.log('Using API Key ending in:', apiKey.slice(-4));
  const model = getEnvValue('OPENAI_MODEL') || 'gpt-4o';
  console.log(`Sending test request to OpenAI (${model})...`);
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        max_completion_tokens: 1024,
        messages: [{ 
          role: 'user', 
          content: 'Write a single line of Tailwind CSS HTML for a blue button that says "Test Success".' 
        }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? '';

    console.log('\n✅ OpenAI Response Received:');
    console.log('------------------------');
    console.log(text);
    console.log('------------------------');
    console.log('\nConnectivity test PASSED.');
  } catch (error) {
    console.error('\n❌ AI Request FAILED:');
    console.error(error.message);
  }
}

if (provider === 'openai') {
  runOpenAITest();
} else {
  runClaudeTest();
}
