import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(_: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id: jobId, fileId } = await params;

  const att = await prisma.gmailSyncedAttachment.findFirst({
    where: {
      id: fileId,
      message: { jobId },
    },
  });

  if (!att) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const abs = path.join(process.cwd(), att.storagePath);
  try {
    const buf = await fs.readFile(abs);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': att.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'File missing on server' }, { status: 404 });
  }
}
