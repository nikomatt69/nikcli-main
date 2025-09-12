import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
    const response = await fetch(`${backendUrl}/web/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Config fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch configuration',
        message: 'Please ensure your NikCLI backend server is running and NEXT_PUBLIC_API_URL is configured correctly.'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
    const body = await request.json();
    
    const response = await fetch(`${backendUrl}/web/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Config update error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update configuration',
        message: 'Please ensure your NikCLI backend server is running and NEXT_PUBLIC_API_URL is configured correctly.'
      },
      { status: 500 }
    );
  }
}