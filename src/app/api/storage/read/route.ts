import { NextResponse } from 'next/server';
import { getBucket } from '@/lib/gcs';
import fs from 'fs/promises';
import path from 'path';

const FILE_NAME = 'document.html';
const STORAGE_DIR = path.join(process.cwd(), 'storage');
const FILE_PATH = path.join(STORAGE_DIR, FILE_NAME);

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Slide.html Document</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen p-8 flex flex-col items-center justify-center font-sans">
  <div class="max-w-2xl w-full bg-white p-10 rounded-xl shadow-lg border border-gray-100 relative">
    <h1 class="text-4xl font-bold text-gray-900 mb-4 tracking-tight">Welcome to Slide.html</h1>
    <p class="text-lg text-gray-600 mb-8 leading-relaxed">
      This is a generated document. You can select elements, move them, or resize them.
      When you are done, click <strong>Refactor</strong> to let the AI update the code.
    </p>
    <div class="grid grid-cols-2 gap-4">
      <div class="bg-blue-50 p-6 rounded-lg border border-blue-100">
        <h2 class="text-xl font-semibold text-blue-800 mb-2">Feature One</h2>
        <p class="text-blue-600">Drag me around to test the visual editing capabilities.</p>
      </div>
      <div class="bg-emerald-50 p-6 rounded-lg border border-emerald-100">
        <h2 class="text-xl font-semibold text-emerald-800 mb-2">Feature Two</h2>
        <p class="text-emerald-600">Resize me to see how the layout adapts.</p>
      </div>
    </div>
    <button class="mt-8 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-6 rounded-full transition-colors">
      Interactive Button
    </button>
  </div>
</body>
</html>`;

export async function GET() {
  try {
    const isCloud = process.env.STORAGE_MODE === 'cloud';

    if (isCloud) {
      const bucket = getBucket();
      const file = bucket.file(FILE_NAME);
      
      const [exists] = await file.exists();
      
      if (!exists) {
        return NextResponse.json({ html: DEFAULT_HTML });
      }
      
      const [contentBuffer] = await file.download();
      return NextResponse.json({ html: contentBuffer.toString('utf-8') });
    } else {
      // Local storage fallback
      await fs.mkdir(STORAGE_DIR, { recursive: true });
      
      try {
        const content = await fs.readFile(FILE_PATH, 'utf-8');
        return NextResponse.json({ html: content });
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return NextResponse.json({ html: DEFAULT_HTML });
        }
        throw error;
      }
    }
  } catch (error) {
    console.error('Error reading document:', error);
    return NextResponse.json({ error: 'Failed to read document' }, { status: 500 });
  }
}
