import { NextRequest, NextResponse } from 'next/server';

// Mock jobs data
const mockJobs = [
  {
    id: 'job-1',
    name: 'Code Review Agent',
    description: 'Automated code review for pull request #123',
    status: 'completed',
    repository: 'nikomatt69/nikcli-main',
    branch: 'feature/new-feature',
    createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    completedAt: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
    duration: 1800, // 30 minutes
    progress: 100,
    logs: [
      { timestamp: new Date(Date.now() - 3600000).toISOString(), level: 'info', message: 'Starting code review...' },
      { timestamp: new Date(Date.now() - 3300000).toISOString(), level: 'info', message: 'Analyzing code changes...' },
      { timestamp: new Date(Date.now() - 3000000).toISOString(), level: 'info', message: 'Checking code quality...' },
      { timestamp: new Date(Date.now() - 2700000).toISOString(), level: 'info', message: 'Generating review comments...' },
      { timestamp: new Date(Date.now() - 1800000).toISOString(), level: 'success', message: 'Code review completed successfully!' },
    ],
    metrics: {
      filesAnalyzed: 12,
      issuesFound: 3,
      suggestionsGenerated: 8,
      linesOfCode: 450,
    },
  },
  {
    id: 'job-2',
    name: 'Test Generation Agent',
    description: 'Generate unit tests for new components',
    status: 'running',
    repository: 'nikomatt69/demo-project',
    branch: 'main',
    createdAt: new Date(Date.now() - 900000).toISOString(), // 15 minutes ago
    progress: 65,
    logs: [
      { timestamp: new Date(Date.now() - 900000).toISOString(), level: 'info', message: 'Starting test generation...' },
      { timestamp: new Date(Date.now() - 600000).toISOString(), level: 'info', message: 'Analyzing component structure...' },
      { timestamp: new Date(Date.now() - 300000).toISOString(), level: 'info', message: 'Generating test cases...' },
    ],
    metrics: {
      componentsAnalyzed: 5,
      testsGenerated: 12,
      coverage: 85,
    },
  },
  {
    id: 'job-3',
    name: 'Documentation Agent',
    description: 'Update API documentation',
    status: 'pending',
    repository: 'nikomatt69/web-interface',
    branch: 'docs/update',
    createdAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
    progress: 0,
    logs: [
      { timestamp: new Date(Date.now() - 300000).toISOString(), level: 'info', message: 'Job queued for execution...' },
    ],
    metrics: {},
  },
  {
    id: 'job-4',
    name: 'Bug Fix Agent',
    description: 'Fix critical bug in authentication system',
    status: 'failed',
    repository: 'nikomatt69/nikcli-main',
    branch: 'bugfix/auth-issue',
    createdAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    completedAt: new Date(Date.now() - 6000000).toISOString(), // 1.5 hours ago
    duration: 1200, // 20 minutes
    progress: 45,
    logs: [
      { timestamp: new Date(Date.now() - 7200000).toISOString(), level: 'info', message: 'Starting bug fix analysis...' },
      { timestamp: new Date(Date.now() - 6900000).toISOString(), level: 'info', message: 'Identifying root cause...' },
      { timestamp: new Date(Date.now() - 6600000).toISOString(), level: 'error', message: 'Failed to access authentication service' },
      { timestamp: new Date(Date.now() - 6000000).toISOString(), level: 'error', message: 'Job failed due to service unavailability' },
    ],
    metrics: {
      filesAnalyzed: 8,
      errorsFound: 2,
      fixesAttempted: 1,
    },
  },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status');

    let filteredJobs = mockJobs;
    
    if (status) {
      filteredJobs = mockJobs.filter(job => job.status === status);
    }

    const paginatedJobs = filteredJobs.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: { 
        jobs: paginatedJobs,
        total: filteredJobs.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Jobs fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch jobs',
        message: 'This is a demo interface. Background agents are not fully configured.'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Create a new mock job
    const newJob = {
      id: `job-${Date.now()}`,
      name: body.name || 'New Background Job',
      description: body.description || 'A new background agent job',
      status: 'pending',
      repository: body.repository || 'nikomatt69/nikcli-main',
      branch: body.branch || 'main',
      createdAt: new Date().toISOString(),
      progress: 0,
      logs: [
        { 
          timestamp: new Date().toISOString(), 
          level: 'info', 
          message: 'Job created and queued for execution...' 
        },
      ],
      metrics: {},
    };

    return NextResponse.json({
      success: true,
      data: { 
        jobId: newJob.id,
        job: newJob,
      },
      message: 'Job created successfully (demo mode)',
    });
  } catch (error) {
    console.error('Job creation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create job',
        message: 'This is a demo interface. Background agents are not fully configured.'
      },
      { status: 500 }
    );
  }
}