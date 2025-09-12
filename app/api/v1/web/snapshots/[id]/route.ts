import { NextRequest, NextResponse } from 'next/server';

// Mock snapshots data (same as in snapshots/route.ts)
const mockSnapshots = [
  {
    id: 'snapshot-1',
    name: 'Production Release v1.2.0',
    description: 'Stable release with new features and bug fixes',
    repository: 'nikomatt69/nikcli-main',
    branch: 'main',
    commit: 'a1b2c3d4e5f6',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    size: 1024 * 1024 * 15,
    fileCount: 1250,
    status: 'completed',
    tags: ['production', 'stable', 'v1.2.0'],
    files: [
      { path: 'src/cli/index.ts', size: 1024 * 5, type: 'file' },
      { path: 'src/web/components/', size: 1024 * 10, type: 'directory' },
      { path: 'package.json', size: 1024 * 2, type: 'file' },
      { path: 'README.md', size: 1024 * 1, type: 'file' },
    ],
    changes: [
      { file: 'src/cli/index.ts', type: 'modified', lines: 15 },
      { file: 'src/web/components/Button.tsx', type: 'added', lines: 45 },
      { file: 'src/old/file.ts', type: 'deleted', lines: 0 },
    ],
  },
  {
    id: 'snapshot-2',
    name: 'Feature Branch - New UI',
    description: 'Work in progress on the new user interface',
    repository: 'nikomatt69/web-interface',
    branch: 'feature/new-ui',
    commit: 'b2c3d4e5f6g7',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    size: 1024 * 1024 * 8,
    fileCount: 450,
    status: 'completed',
    tags: ['feature', 'ui', 'wip'],
    files: [
      { path: 'src/components/NewUI.tsx', size: 1024 * 3, type: 'file' },
      { path: 'src/styles/', size: 1024 * 2, type: 'directory' },
    ],
    changes: [
      { file: 'src/components/NewUI.tsx', type: 'added', lines: 120 },
      { file: 'src/styles/theme.css', type: 'modified', lines: 25 },
    ],
  },
];

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const snapshotId = params.id;
    const snapshot = mockSnapshots.find(s => s.id === snapshotId);

    if (!snapshot) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Snapshot not found' 
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { snapshot },
    });
  } catch (error) {
    console.error('Snapshot fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch snapshot',
        message: 'This is a demo interface. Snapshots are not fully configured.'
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
    const snapshotId = params.id;
    const snapshot = mockSnapshots.find(s => s.id === snapshotId);

    if (!snapshot) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Snapshot not found' 
        },
        { status: 404 }
      );
    }

    // In a real implementation, you would delete the snapshot
    console.log(`Deleting snapshot: ${snapshotId}`);

    return NextResponse.json({
      success: true,
      data: { success: true },
      message: 'Snapshot deleted successfully (demo mode)',
    });
  } catch (error) {
    console.error('Snapshot deletion error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete snapshot',
        message: 'This is a demo interface. Snapshots are not fully configured.'
      },
      { status: 500 }
    );
  }
}