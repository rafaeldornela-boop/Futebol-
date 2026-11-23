import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Serve o arquivo index.html puro na raiz para que o ambiente de pré-visualização
 * execute diretamente o jogo em HTML, CSS e JavaScript puros (sem React).
 */
export async function GET() {
  const indexPath = path.join(process.cwd(), 'index.html');
  const html = await readFile(indexPath, 'utf-8');
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
