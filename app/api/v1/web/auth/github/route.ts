import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // For demo purposes, redirect to GitHub OAuth
    // In a real implementation, this would initiate the OAuth flow
    const githubOAuthUrl = new URL('https://github.com/login/oauth/authorize');
    githubOAuthUrl.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID || 'demo-client-id');
    githubOAuthUrl.searchParams.set('redirect_uri', `${request.nextUrl.origin}/api/v1/web/auth/github/callback`);
    githubOAuthUrl.searchParams.set('scope', 'repo,user');
    githubOAuthUrl.searchParams.set('state', 'demo-state');

    return NextResponse.redirect(githubOAuthUrl.toString());
  } catch (error) {
    console.error('GitHub OAuth initiation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to initiate GitHub OAuth',
        message: 'GitHub integration is not configured. This is a demo interface.'
      },
      { status: 500 }
    );
  }
}