import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get the backend API URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL;
    
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
    let fullBackendUrl = backendUrl;
    if (!backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
      fullBackendUrl = `https://${backendUrl}`;
    }
    
    // Redirect to the actual NikCLI backend GitHub OAuth endpoint
    const githubAuthUrl = `${fullBackendUrl}/web/auth/github`;
    
    return NextResponse.redirect(githubAuthUrl);
  } catch (error) {
    console.error('GitHub OAuth redirect error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to redirect to GitHub OAuth',
        message: 'Please ensure your NikCLI backend server is running and NEXT_PUBLIC_API_URL is configured correctly.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}