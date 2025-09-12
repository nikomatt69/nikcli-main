import { NextRequest, NextResponse } from 'next/server';

// Mock snapshots data
const mockSnapshots = [
  {
    id: 'snapshot-1',
    name: 'Production Release v1.2.0',
    description: 'Stable release with new features and bug fixes',
    repository: 'nikomatt69/nikcli-main',
    branch: 'main',
    commit: 'a1b2c3d4e5f6',
    createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    size: 1024 * 1024 * 15, // 15MB
    fileCount: 1250,
    status: 'completed',
    tags: ['production', 'stable', 'v1.2.0'],
  },
  {
    id: 'snapshot-2',
    name: 'Feature Branch - New UI',
    description: 'Work in progress on the new user interface',
    repository: 'nikomatt69/web-interface',
    branch: 'feature/new-ui',
    commit: 'b2c3d4e5f6g7',
    createdAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
    size: 1024 * 1024 * 8, // 8MB
    fileCount: 450,
    status: 'completed',
    tags: ['feature', 'ui', 'wip'],
  },
  {
    id: 'snapshot-3',
    name: 'Bug Fix - Auth Issue',
    description: 'Critical authentication bug fix',
    repository: 'nikomatt69/nikcli-main',
    branch: 'bugfix/auth-issue',
    commit: 'c3d4e5f6g7h8',
    createdAt: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
    size: 1024 * 1024 * 3, // 3MB
    fileCount: 120,
    status: 'completed',
    tags: ['bugfix', 'critical', 'auth'],
  },
  {
    id: 'snapshot-4',
    name: 'Development Snapshot',
    description: 'Current development state',
    repository: 'nikomatt69/demo-project',
    branch: 'develop',
    commit: 'd4e5f6g7h8i9',
    createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    size: 1024 * 1024 * 5, // 5MB
    fileCount: 300,
    status: 'processing',
    tags: ['development', 'latest'],
  },
];

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      data: { snapshots: mockSnapshots },
    });
  } catch (error) {
    console.error('Snapshots fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch snapshots',
        message: 'This is a demo interface. Snapshots are not fully configured.'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Create a new mock snapshot
    const newSnapshot = {
      id: `snapshot-${Date.now()}`,
      name: body.name || 'New Snapshot',
      description: body.description || 'A new project snapshot',
      repository: body.repository || 'nikomatt69/nikcli-main',
      branch: body.branch || 'main',
      commit: 'e5f6g7h8i9j0',
      createdAt: new Date().toISOString(),
      size: 1024 * 1024 * 2, // 2MB
      fileCount: 150,
      status: 'processing',
      tags: body.tags || ['manual'],
    };

    return NextResponse.json({
      success: true,
      data: { snapshot: newSnapshot },
      message: 'Snapshot created successfully (demo mode)',
    });
  } catch (error) {
    console.error('Snapshot creation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create snapshot',
        message: 'This is a demo interface. Snapshots are not fully configured.'
      },
      { status: 500 }
    );
  }
}