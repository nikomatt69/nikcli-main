import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../../lib/api-proxy';

export async function GET(request: NextRequest) {
  const response = await proxyToBackend('/health');
  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}