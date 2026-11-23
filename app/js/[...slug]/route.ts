import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Serve módulos ES estáticos da pasta /js com validação segura de caminho.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await context.params;
  if (!Array.isArray(slug) || slug.length === 0) {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  const baseDir = path.resolve(process.cwd(), 'js');
  const resolved = path.resolve(baseDir, ...slug);

  if (!resolved.startsWith(baseDir + path.sep) || !resolved.endsWith('.js')) {
    return new NextResponse('Acesso negado', { status: 403 });
  }

  try {
    const content = await readFile(resolved, 'utf-8');
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new NextResponse('Módulo JS não encontrado', { status: 404 });
  }
}
