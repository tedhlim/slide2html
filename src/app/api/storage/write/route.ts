import { NextRequest, NextResponse } from 'next/server';
import { getBucket } from '@/lib/gcs';
import fs from 'fs/promises';
import path from 'path';

const FILE_NAME = 'document.html';
const STORAGE_DIR = path.join(process.cwd(), 'storage');
const FILE_PATH = path.join(STORAGE_DIR, FILE_NAME);

export async function POST(req: NextRequest) {
  try {
    const { html } = await req.json();
    
    if (typeof html !== 'string') {
      return NextResponse.json({ error: 'Invalid HTML content' }, { status: 400 });
    }

    const isCloud = process.env.STORAGE_MODE === 'cloud';

    if (isCloud) {
      const bucket = getBucket();
      const file = bucket.file(FILE_NAME);
      
      await file.save(html, {
        contentType: 'text/html',
        resumable: false,
      });
    } else {
      // Local storage fallback
      await fs.mkdir(STORAGE_DIR, { recursive: true });
      await fs.writeFile(FILE_PATH, html, 'utf-8');
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error writing document:', error);
    return NextResponse.json({ error: 'Failed to write document' }, { status: 500 });
  }
}
