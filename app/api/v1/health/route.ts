import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get backend URL with proper validation
    let backendUrl = process.env.NEXT_PUBLIC_API_URL;
    
    // If no backend URL is configured, return a helpful error
    if (!backendUrl) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Backend not configured',
          message: 'NEXT_PUBLIC_API_URL environment variable is not set. Please configure your NikCLI backend server URL.',
          config: {
            required: 'NEXT_PUBLIC_API_URL',
            example: 'https://your-nikcli-backend.com/api/v1'
          }
        },
        { status: 503 }
      );
    }

    // Ensure the URL has a protocol
    if (!backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
      backendUrl = `https://${backendUrl}`;
    }

    const healthUrl = `${backendUrl}/health`;
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to check backend health',
        message: 'Please ensure your NikCLI backend server is running and NEXT_PUBLIC_API_URL is configured correctly.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}