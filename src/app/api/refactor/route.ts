import { NextRequest, NextResponse } from 'next/server';
import { VisualDelta } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { originalHtml, deltas } = await req.json();

    if (!originalHtml || !deltas) {
      return NextResponse.json({ error: 'Missing originalHtml or deltas' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY is not set');
      return NextResponse.json({ error: 'AI API key not configured. Check your .env.local file.' }, { status: 500 });
    }

    const prompt = `You are an expert web developer specializing in Tailwind CSS.
I have an HTML document and a set of visual changes (deltas) made by a user in a visual editor.
Your goal is to refactor the HTML to apply these changes while maintaining clean, semantic code and using Tailwind CSS utility classes.

### Rules:
1. Prioritize Tailwind CSS utility classes over inline styles.
2. Infer layout intent: if items are moved together, consider using flex or grid.
3. Maintain the original design system (colors, spacing) unless explicitly changed.
4. Round sub-pixel values to the nearest integer (e.g., 10.02px -> 10px).
5. RETURN ONLY THE FULL REFACTORED HTML CODE. NO EXPLANATIONS.

### Original HTML:
\`\`\`html
${originalHtml}
\`\`\`

### Visual Deltas (JSON):
\`\`\`json
${JSON.stringify(deltas, null, 2)}
\`\`\`

Refactor the original HTML applying these deltas and return the final HTML string.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    let refactoredHtml: string = data.content?.[0]?.text ?? '';

    if (!refactoredHtml) {
      throw new Error('AI returned an empty response');
    }

    // Clean up markdown code blocks if the AI included them
    refactoredHtml = refactoredHtml.replace(/^```html\n/, '').replace(/\n```$/, '');
    refactoredHtml = refactoredHtml.replace(/^```\n/, '').replace(/\n```$/, '');

    return NextResponse.json({ refactoredHtml: refactoredHtml.trim() });
  } catch (error: any) {
    console.error('Error in refactor API:', error);
    return NextResponse.json({
      error: 'Failed to refactor HTML',
      details: error.message,
    }, { status: 500 });
  }
}
