import { NextRequest, NextResponse } from 'next/server';

// Mock job data (same as in jobs/route.ts but with more detail)
const mockJobs = [
  {
    id: 'job-1',
    name: 'Code Review Agent',
    description: 'Automated code review for pull request #123',
    status: 'completed',
    repository: 'nikomatt69/nikcli-main',
    branch: 'feature/new-feature',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    completedAt: new Date(Date.now() - 1800000).toISOString(),
    duration: 1800,
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
    followUpMessages: [
      {
        id: 'msg-1',
        type: 'suggestion',
        title: 'Consider using TypeScript strict mode',
        content: 'The code would benefit from enabling TypeScript strict mode for better type safety.',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
      },
      {
        id: 'msg-2',
        type: 'question',
        title: 'Should we add error handling here?',
        content: 'This function might throw an error. Should we add try-catch blocks?',
        timestamp: new Date(Date.now() - 1700000).toISOString(),
      },
    ],
  },
  {
    id: 'job-2',
    name: 'Test Generation Agent',
    description: 'Generate unit tests for new components',
    status: 'running',
    repository: 'nikomatt69/demo-project',
    branch: 'main',
    createdAt: new Date(Date.now() - 900000).toISOString(),
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
    followUpMessages: [],
  },
];

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;
    const job = mockJobs.find(j => j.id === jobId);

    if (!job) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Job not found' 
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { job },
    });
  } catch (error) {
    console.error('Job fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch job',
        message: 'This is a demo interface. Background agents are not fully configured.'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;
    const job = mockJobs.find(j => j.id === jobId);

    if (!job) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Job not found' 
        },
        { status: 404 }
      );
    }

    // In a real implementation, you would cancel the job
    console.log(`Cancelling job: ${jobId}`);

    return NextResponse.json({
      success: true,
      data: { success: true },
      message: 'Job cancelled successfully (demo mode)',
    });
  } catch (error) {
    console.error('Job cancellation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to cancel job',
        message: 'This is a demo interface. Background agents are not fully configured.'
      },
      { status: 500 }
    );
  }
}