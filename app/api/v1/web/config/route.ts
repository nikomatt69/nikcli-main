import { NextRequest, NextResponse } from 'next/server';

// Mock configuration data
const mockConfig = {
  github: {
    enabled: false,
    token: '',
    username: '',
    defaultRepository: '',
  },
  ai: {
    defaultModel: 'claude-3-5-sonnet-20241022',
    maxTokens: 4000,
    temperature: 0.7,
  },
  notifications: {
    enabled: true,
    email: '',
    webhook: '',
  },
  limits: {
    maxConcurrentJobs: 3,
    maxJobDuration: 3600, // 1 hour
    maxJobsPerDay: 10,
  },
};

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      data: { config: mockConfig },
    });
  } catch (error) {
    console.error('Config fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch configuration' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // In a real implementation, you would save this to a database
    console.log('Config update:', body);
    
    return NextResponse.json({
      success: true,
      data: { config: { ...mockConfig, ...body } },
      message: 'Configuration updated successfully (demo mode)',
    });
  } catch (error) {
    console.error('Config update error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update configuration' 
      },
      { status: 500 }
    );
  }
}