import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get the backend API URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
    
    // Redirect to the actual NikCLI backend GitHub OAuth endpoint
    const githubAuthUrl = `${backendUrl}/web/auth/github`;
    
    return NextResponse.redirect(githubAuthUrl);
  } catch (error) {
    console.error('GitHub OAuth redirect error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to redirect to GitHub OAuth',
        message: 'Please ensure your NikCLI backend server is running and NEXT_PUBLIC_API_URL is configured correctly.'
      },
      { status: 500 }
    );
  }
}