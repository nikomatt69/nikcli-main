import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get the backend API URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
    
    // Forward the callback to the actual NikCLI backend
    const callbackUrl = `${backendUrl}/web/auth/github/callback${request.nextUrl.search}`;
    
    return NextResponse.redirect(callbackUrl);
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process GitHub OAuth callback',
        message: 'Please ensure your NikCLI backend server is running and NEXT_PUBLIC_API_URL is configured correctly.'
      },
      { status: 500 }
    );
  }
}