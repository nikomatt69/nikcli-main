import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../../../lib/api-proxy';

export async function GET(request: NextRequest) {
  const response = await proxyToBackend('/web/config');
  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await proxyToBackend('/web/config', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return new NextResponse(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to parse request body',
        message: 'Invalid JSON in request body.'
      },
      { status: 400 }
    );
  }
}