import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Authorization code not provided' 
        },
        { status: 400 }
      );
    }

    // For demo purposes, simulate successful authentication
    // In a real implementation, you would exchange the code for an access token
    const mockToken = `demo_token_${Date.now()}`;
    
    // Redirect to the config page with success message
    const redirectUrl = new URL('/config', request.url);
    redirectUrl.searchParams.set('github_auth', 'success');
    redirectUrl.searchParams.set('token', mockToken);

    return NextResponse.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'GitHub authentication failed',
        message: 'This is a demo interface. GitHub integration is not fully configured.'
      },
      { status: 500 }
    );
  }
}