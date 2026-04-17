import { NextRequest, NextResponse } from 'next/server';
import { VisualDelta } from '@/lib/types';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

type Provider = 'claude' | 'openai';

async function callClaude(prompt: string): Promise<string> {
// ... unchanged ...
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL ?? 'claude-opus-4-5',
      max_tokens: 8096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text ?? '';
}

async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-5',
      max_completion_tokens: 8096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export async function POST(req: NextRequest) {
  try {
    // Purge old debug files and ensure directory exists
    const debugDir = path.join(process.cwd(), 'debug');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    } else {
      const existingFiles = fs.readdirSync(debugDir);
      for (const file of existingFiles) {
        if (file.startsWith('debug_prompt_') && file.endsWith('.txt')) {
          fs.unlinkSync(path.join(debugDir, file));
        }
      }
    }

    const { originalHtml, deltas } = await req.json();

    if (!originalHtml || !deltas) {
      return NextResponse.json({ error: 'Missing originalHtml or deltas' }, { status: 400 });
    }

    const provider: Provider = (process.env.AI_PROVIDER as Provider) ?? 'claude';
    const deltaArray: VisualDelta[] = Array.isArray(deltas) ? deltas : [deltas];
    
    // Parse the entire document tree
    const $ = cheerio.load(originalHtml);
    
    // Track which parent containers need AI refactoring
    const aiJobs = new Map<string, { parent: cheerio.Cheerio<any>; deltas: VisualDelta[] }>();

    for (const delta of deltaArray) {
      const target = $(delta.target_selector);
      if (target.length === 0) continue;

      // 0. Deletion (Deterministic, no AI)
      if (delta.deleted) {
        target.remove();
        continue;
      }

      // 1. Direct Content Updates (Deterministic, no AI)
      if (delta.changes?.content) {
        target.text(delta.changes.content.to);
      }

      // 2. Geometry or Style Updates (Require AI to translate into Tailwind)
      if (delta.changes?.geometry || delta.changes?.style) {
        let parent: cheerio.Cheerio<any> = target.parent();
        
        // Prevent grabbing the entire deck/body
        if (parent.attr('id') === 'deck' || parent.hasClass('deck') || parent.is('body')) {
          parent = target as cheerio.Cheerio<any>;
        }

        if (parent.length > 0) {
          // Tag parent with a temporary ID for replacement tracking
          let tmpId = parent.attr('data-ai-id');
          if (!tmpId) {
            tmpId = Math.random().toString(36).substring(2, 9);
            parent.attr('data-ai-id', tmpId);
          }

          // **CRITICAL FIX**: Tag the specific target element inside the snippet!
          let targetMarkId = target.attr('data-ai-target');
          if (!targetMarkId) {
            targetMarkId = 'target-' + Math.random().toString(36).substring(2, 6);
            target.attr('data-ai-target', targetMarkId);
          }

          if (!aiJobs.has(tmpId)) {
            aiJobs.set(tmpId, { parent, deltas: [] });
          }

          // If the target IS the container itself, reference it by its data-ai-id
          // to avoid the container being BOTH the root and a target (causes conflicts)
          const targetIsParent = target.is(parent);
          let deltaSelector: string;

          if (targetIsParent) {
            deltaSelector = `[data-ai-id="${tmpId}"]`;
          } else {
            // Tag the specific child element inside the snippet
            let targetMarkId = target.attr('data-ai-target');
            if (!targetMarkId) {
              targetMarkId = 'target-' + Math.random().toString(36).substring(2, 6);
              target.attr('data-ai-target', targetMarkId);
            }
            deltaSelector = `[data-ai-target="${targetMarkId}"]`;
          }
          
          // Store a mapped delta specifically for the AI, so it uses the isolated ID
          aiJobs.get(tmpId)!.deltas.push({
            ...delta,
            target_selector: deltaSelector
          });
        }
      }
    }

    // 3. Process AI Jobs
    for (const [tmpId, job] of aiJobs.entries()) {
      // Extract just this container instead of the whole page
      const containerHtml = $.html(job.parent);
      
      const imgDictionary = new Map<string, string>();
      const strippedContainerHtml = containerHtml.replace(/src="(data:image\/[^;]+;base64,[^"]+)"/g, (match, b64) => {
        const maskId = `MASK_IMG_${Math.random().toString(36).substring(2)}`;
        imgDictionary.set(maskId, b64);
        return `src="${maskId}"`;
      });
      
      const prompt = `You are an expert web developer specializing in Tailwind CSS.
I have a small HTML snippet (a container and its children) and a set of visual changes (deltas) made by a user.
Your goal is to refactor this specific HTML snippet to apply these changes while maintaining clean, semantic code and using Tailwind CSS utility classes.

### Rules:
1. Prioritize Tailwind CSS utility classes over inline styles.
2. Infer layout intent: if items are moved together, consider using flex or grid.
3. geometry.position changes (dx, dy) represent RELATIVE pixel movement by the user. Choose the CORRECT CSS approach based on the element's current layout context:
   - If the element is position:absolute or position:relative with top/left — adjust those offset values by dx/dy.
   - If the element uses FLOW LAYOUT (inline, block, flex children, etc.) — adjust margin-top (for dy) and margin-left (for dx). NEVER use transform/translate on flow-layout elements — it will appear to have no effect.
   - Example: dy:-63 on a flow element means it moved 63px UP → add or adjust its top margin: class like -mt-16 or mt-[-63px].
4. geometry.size changes (dw, dh) represent RELATIVE pixel size changes. Adjust width/height classes (e.g. dw:50 → increase w- by 50px).
5. Maintain the original design system (colors, spacing) unless explicitly changed.
6. Round sub-pixel values to the nearest integer (e.g., 10px).
7. RETURN ONLY THE FULL REFACTORED HTML CODE FOR THIS SNIPPET. NO EXPLANATIONS.
8. CRITICAL: Make sure to KEEP the 'data-ai-id="${tmpId}"' attribute on the root container element.
9. CRITICAL: Your target elements are marked with 'data-ai-target'. Use this to locate them, and cleanly REMOVE these 'data-ai-target' attributes from your final output.

### Container HTML:
\`\`\`html
${strippedContainerHtml}
\`\`\`

### Visual Deltas (JSON):
\`\`\`json
${JSON.stringify(job.deltas, null, 2)}
\`\`\`

Refactor the container HTML applying these deltas and return the final HTML snippet.`;

      // DEBUG: Dump the prompt out to the debug folder to check how big this isolated chunk really is
      const debugFilePath = path.join(debugDir, `debug_prompt_${tmpId}.txt`);
      fs.writeFileSync(debugFilePath, prompt, 'utf8');

      let rawOutput: string;
      if (provider === 'openai') {
        rawOutput = await callOpenAI(prompt);
      } else {
        rawOutput = await callClaude(prompt);
      }

      if (rawOutput) {
        let refactoredHtml = rawOutput
          .replace(/^```html\n/, '').replace(/\n```$/, '')
          .replace(/^```\n/, '').replace(/\n```$/, '')
          .trim();
          
        // Restore base64 strings
        for (const [maskId, b64] of imgDictionary.entries()) {
          refactoredHtml = refactoredHtml.replace(maskId, b64);
        }
        
        $(`[data-ai-id="${tmpId}"]`).replaceWith(refactoredHtml);
      }
    }

    // Clean up temporary tracking IDs
    $('[data-ai-id]').removeAttr('data-ai-id');

    return NextResponse.json({ refactoredHtml: $.html(), provider });
  } catch (error: any) {
    console.error('Error in refactor API:', error);
    return NextResponse.json({
      error: 'Failed to refactor HTML',
      details: error.message,
    }, { status: 500 });
  }
}
