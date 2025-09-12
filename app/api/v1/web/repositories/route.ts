import { NextResponse } from 'next/server';

// Mock GitHub repositories data
const mockRepositories = [
  {
    id: 1,
    name: 'nikcli-main',
    fullName: 'nikomatt69/nikcli-main',
    description: 'NikCLI - Context-Aware AI Development Assistant',
    private: false,
    htmlUrl: 'https://github.com/nikomatt69/nikcli-main',
    cloneUrl: 'https://github.com/nikomatt69/nikcli-main.git',
    defaultBranch: 'main',
    language: 'TypeScript',
    stars: 42,
    forks: 8,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: 'demo-project',
    fullName: 'nikomatt69/demo-project',
    description: 'A demo project for testing background agents',
    private: true,
    htmlUrl: 'https://github.com/nikomatt69/demo-project',
    cloneUrl: 'https://github.com/nikomatt69/demo-project.git',
    defaultBranch: 'main',
    language: 'JavaScript',
    stars: 15,
    forks: 3,
    updatedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
  },
  {
    id: 3,
    name: 'web-interface',
    fullName: 'nikomatt69/web-interface',
    description: 'Modern web interface for AI agents',
    private: false,
    htmlUrl: 'https://github.com/nikomatt69/web-interface',
    cloneUrl: 'https://github.com/nikomatt69/web-interface.git',
    defaultBranch: 'main',
    language: 'React',
    stars: 28,
    forks: 5,
    updatedAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
  },
];

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      data: { repositories: mockRepositories },
    });
  } catch (error) {
    console.error('Repositories fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch repositories',
        message: 'This is a demo interface. GitHub integration is not fully configured.'
      },
      { status: 500 }
    );
  }
}