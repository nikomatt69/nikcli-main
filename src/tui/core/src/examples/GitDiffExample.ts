import blessed from 'blessed'
import { FileChangeTracker, GitDiffBlock } from '../components'

/**
 * Example: GitDiffBlock integration with AI file modifications
 * This demonstrates how to use GitDiffBlock and FileChangeTracker together
 * to visualize file changes made by AI agents in real-time.
 */

export class GitDiffExample {
  private screen: blessed.Widgets.Screen
  private diffBlock: GitDiffBlock
  private tracker: FileChangeTracker
  private statusBar: blessed.Widgets.BoxElement

  constructor() {
    // Create blessed screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Git Diff Block Example - AI File Modifications',
    })

    // Initialize file change tracker
    this.tracker = new FileChangeTracker()

    // Create status bar
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      right: 0,
      height: 3,
      border: {
        type: 'line',
      },
      style: {
        bg: 'blue',
        fg: 'white',
      },
      content: " Ready - Press 't' to simulate AI edit, 's' to switch layout, 'q' to quit ",
    })

    // Create GitDiffBlock
    this.diffBlock = new GitDiffBlock({
      parent: this.screen,
      top: 0,
      left: 0,
      right: 0,
      bottom: 3, // Leave space for status bar
      layout: 'split',
      showLineNumbers: true,
      showStats: true,
      diffTheme: 'dark',
      borderStyle: 'line',
    })

    this.setupEventHandlers()
    this.setupKeyHandlers()

    // Show initial example
    this.showInitialExample()
  }

  private setupEventHandlers(): void {
    // Listen for file changes
    this.tracker.subscribe((event) => {
      this.updateStatusBar(
        `${event.operation} - ${event.filePath} (${event.diff?.stats.additions}+, ${event.diff?.stats.deletions}-)`
      )

      if (event.diff) {
        this.diffBlock.setDiffData(event.diff)
      }
    })
  }

  private setupKeyHandlers(): void {
    // Global quit
    this.screen.key(['q', 'C-c'], () => {
      process.exit(0)
    })

    // Simulate AI file edit
    this.screen.key(['t'], () => {
      this.simulateAIEdit()
    })

    // Switch layout
    this.screen.key(['s'], () => {
      this.diffBlock.toggleLayout()
      this.updateStatusBar('Layout switched')
    })

    // Show example files
    this.screen.key(['1'], () => {
      this.showTypeScriptExample()
    })

    this.screen.key(['2'], () => {
      this.showPythonExample()
    })

    this.screen.key(['3'], () => {
      this.showJSONExample()
    })

    // Focus diff block
    this.diffBlock.focus()
  }

  private updateStatusBar(message: string): void {
    const stats = this.tracker.getStats()
    this.statusBar.setContent(
      ` ${message} | Total changes: ${stats.totalChanges} | Files tracked: ${stats.trackedFiles} | Press 't' for AI edit, 's' for layout, '1-3' for examples, 'q' to quit `
    )
    this.screen.render()
  }

  private showInitialExample(): void {
    const oldContent = `function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price;
  }
  return total;
}

module.exports = { calculateTotal };`

    const newContent = `function calculateTotal(items) {
  let total = 0;
  let tax = 0;
  
  for (const item of items) {
    total += item.price;
    tax += item.price * 0.1; // 10% tax
  }
  
  return {
    subtotal: total,
    tax: tax,
    total: total + tax
  };
}

export { calculateTotal };`

    this.tracker.trackEdit('src/calculator.js', newContent, oldContent)
    this.updateStatusBar('Showing initial example - AI refactored calculator function')
  }

  private simulateAIEdit(): void {
    const examples = [
      this.simulateReactComponentEdit,
      this.simulateAPIEndpointEdit,
      this.simulateConfigFileEdit,
      this.simulateDocumentationEdit,
    ]

    const randomExample = examples[Math.floor(Math.random() * examples.length)]
    randomExample.call(this)
  }

  private simulateReactComponentEdit(): void {
    const oldContent = `import React from 'react';

function UserProfile({ user }) {
  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
}

export default UserProfile;`

    const newContent = `import React from 'react';
import { Avatar } from './components/Avatar';
import { Badge } from './components/Badge';

interface User {
  name: string;
  email: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
}

interface UserProfileProps {
  user: User;
  showStatus?: boolean;
}

function UserProfile({ user, showStatus = true }: UserProfileProps) {
  return (
    <div className="user-profile">
      <div className="user-header">
        <Avatar src={user.avatar} alt={user.name} />
        <div className="user-info">
          <h1>{user.name}</h1>
          <p className="user-email">{user.email}</p>
          {showStatus && (
            <Badge variant={user.status === 'online' ? 'success' : 'secondary'}>
              {user.status}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserProfile;`

    this.tracker.trackEdit('components/UserProfile.tsx', newContent, oldContent)
  }

  private simulateAPIEndpointEdit(): void {
    const oldContent = `app.get('/users', (req, res) => {
  const users = db.getAllUsers();
  res.json(users);
});`

    const newContent = `app.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    
    const filters = {};
    if (search) {
      filters.name = { $regex: search, $options: 'i' };
    }
    
    const users = await db.getUsers({
      filters,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
    
    const total = await db.countUsers(filters);
    
    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});`

    this.tracker.trackEdit('routes/users.js', newContent, oldContent)
  }

  private simulateConfigFileEdit(): void {
    const oldContent = `{
  "name": "my-app",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}`

    const newContent = `{
  "name": "my-app",
  "version": "0.2.1",
  "description": "A modern web application with enhanced features",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest --coverage",
    "test:watch": "jest --watch",
    "lint": "eslint src/",
    "build": "webpack --mode production"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^6.1.5",
    "dotenv": "^16.0.3"
  },
  "devDependencies": {
    "nodemon": "^2.0.22",
    "jest": "^29.5.0",
    "eslint": "^8.42.0",
    "webpack": "^5.88.0"
  },
  "engines": {
    "node": ">=16.0.0"
  }
}`

    this.tracker.trackEdit('package.json', newContent, oldContent)
  }

  private simulateDocumentationEdit(): void {
    const oldContent = `# My App

A simple web application.

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

\`\`\`bash
npm start
\`\`\``

    const newContent = `# My App

A modern, scalable web application built with Node.js and Express.

## Features

- 🚀 Fast and lightweight
- 🔒 Secure by default with Helmet.js
- 📊 Built-in monitoring and logging
- 🧪 Comprehensive test coverage
- 🎨 Modern UI components

## Installation

\`\`\`bash
# Clone the repository
git clone https://github.com/user/my-app.git
cd my-app

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
\`\`\`

## Usage

### Development
\`\`\`bash
npm run dev
\`\`\`

### Production
\`\`\`bash
npm run build
npm start
\`\`\`

### Testing
\`\`\`bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
\`\`\`

## API Documentation

The API is available at \`/api/v1\` and includes:

- \`GET /users\` - List users with pagination
- \`POST /users\` - Create a new user
- \`PUT /users/:id\` - Update user
- \`DELETE /users/:id\` - Delete user

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request`

    this.tracker.trackEdit('README.md', newContent, oldContent)
  }

  private showTypeScriptExample(): void {
    const oldContent = `interface User {
  name: string;
  email: string;
}

class UserService {
  getUser(id: string): User | null {
    // Implementation
    return null;
  }
}`

    const newContent = `interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateUserRequest {
  name: string;
  email: string;
  avatar?: string;
}

interface UpdateUserRequest {
  name?: string;
  email?: string;
  avatar?: string;
}

class UserService {
  private users: Map<string, User> = new Map();

  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async createUser(request: CreateUserRequest): Promise<User> {
    const user: User = {
      id: crypto.randomUUID(),
      ...request,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: string, request: UpdateUserRequest): Promise<User | null> {
    const existingUser = this.users.get(id);
    if (!existingUser) return null;

    const updatedUser: User = {
      ...existingUser,
      ...request,
      updatedAt: new Date()
    };

    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }
}`

    this.tracker.trackEdit('services/UserService.ts', newContent, oldContent)
    this.updateStatusBar('Showing TypeScript example - Enhanced user service with full CRUD')
  }

  private showPythonExample(): void {
    const oldContent = `def calculate_score(values):
    return sum(values) / len(values)

def main():
    scores = [85, 92, 78, 96, 88]
    avg = calculate_score(scores)
    print(f"Average: {avg}")`

    const newContent = `from typing import List, Optional, Dict, Any
import statistics
from dataclasses import dataclass

@dataclass
class ScoreReport:
    average: float
    median: float
    mode: Optional[float]
    std_dev: float
    min_score: float
    max_score: float
    grade: str

def calculate_score_report(values: List[float]) -> ScoreReport:
    """Calculate comprehensive score statistics."""
    if not values:
        raise ValueError("Cannot calculate scores for empty list")
    
    avg = statistics.mean(values)
    median = statistics.median(values)
    
    try:
        mode = statistics.mode(values)
    except statistics.StatisticsError:
        mode = None
    
    std_dev = statistics.stdev(values) if len(values) > 1 else 0
    min_score = min(values)
    max_score = max(values)
    
    # Determine grade based on average
    if avg >= 90:
        grade = 'A'
    elif avg >= 80:
        grade = 'B'
    elif avg >= 70:
        grade = 'C'
    elif avg >= 60:
        grade = 'D'
    else:
        grade = 'F'
    
    return ScoreReport(
        average=avg,
        median=median,
        mode=mode,
        std_dev=std_dev,
        min_score=min_score,
        max_score=max_score,
        grade=grade
    )

def print_report(report: ScoreReport) -> None:
    """Print a formatted score report."""
    print("=== Score Report ===")
    print(f"Average: {report.average:.2f}")
    print(f"Median: {report.median:.2f}")
    if report.mode is not None:
        print(f"Mode: {report.mode:.2f}")
    print(f"Standard Deviation: {report.std_dev:.2f}")
    print(f"Range: {report.min_score:.2f} - {report.max_score:.2f}")
    print(f"Grade: {report.grade}")

def main() -> None:
    scores = [85.5, 92.0, 78.5, 96.0, 88.5, 91.0, 87.5]
    
    try:
        report = calculate_score_report(scores)
        print_report(report)
    except ValueError as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()`

    this.tracker.trackEdit('calculator.py', newContent, oldContent)
    this.updateStatusBar('Showing Python example - Enhanced score calculator with statistics')
  }

  private showJSONExample(): void {
    const oldContent = `{
  "api": {
    "version": "1.0",
    "endpoints": ["/users", "/posts"]
  }
}`

    const newContent = `{
  "api": {
    "version": "2.0",
    "name": "Content Management API",
    "description": "RESTful API for managing users and content",
    "baseUrl": "https://api.example.com/v2",
    "authentication": {
      "type": "Bearer",
      "tokenUrl": "/auth/token"
    },
    "endpoints": {
      "users": {
        "path": "/users",
        "methods": ["GET", "POST"],
        "description": "User management operations"
      },
      "posts": {
        "path": "/posts",
        "methods": ["GET", "POST", "PUT", "DELETE"],
        "description": "Content management operations"
      },
      "comments": {
        "path": "/posts/{postId}/comments",
        "methods": ["GET", "POST", "DELETE"],
        "description": "Comment management operations"
      }
    },
    "rateLimit": {
      "requests": 1000,
      "window": "1h"
    },
    "cors": {
      "enabled": true,
      "origins": ["https://app.example.com", "https://admin.example.com"]
    }
  }
}`

    this.tracker.trackEdit('api-config.json', newContent, oldContent)
    this.updateStatusBar('Showing JSON example - API configuration with enhanced metadata')
  }

  public run(): void {
    this.screen.render()
  }
}

// Export for use in examples
export default GitDiffExample

// Run example if this file is executed directly
if (require.main === module) {
  const example = new GitDiffExample()
  example.run()
}
