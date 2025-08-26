import { BaseAgent } from './base-agent';
import { modelProvider, ChatMessage } from '../../ai/model-provider';

export class DevOpsAgent extends BaseAgent {
  id = 'devops';
  capabilities = ["deployment","ci-cd","infrastructure","containers"];
  specialization = 'DevOps and infrastructure management';

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory);
  }

  protected async onInitialize(): Promise<void> {
    console.log('DevOps Agent initialized');
  }

  protected async onStop(): Promise<void> {
    console.log('DevOps Agent stopped');
  }

  protected async onExecuteTask(task: any): Promise<any> {
    const taskData = typeof task === 'string' ? task : task.data;
    if (!taskData) {
      return {
        message: 'DevOps Expert ready! I can help with CI/CD, containerization, infrastructure, and cloud deployments',
        specialties: [
          'Docker and container orchestration',
          'Kubernetes deployment and management',
          'CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins)',
          'Infrastructure as Code (Terraform, CloudFormation)',
          'Cloud platforms (AWS, GCP, Azure)',
          'Monitoring and logging (Prometheus, Grafana, ELK)',
          'Security and compliance',
        ],
      };
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a DevOps and infrastructure expert with deep knowledge of:
        
        - Docker containerization and multi-stage builds
        - Kubernetes orchestration and cluster management
        - CI/CD pipeline design and automation
        - Infrastructure as Code (IaC) with Terraform, CloudFormation
        - Cloud platforms: AWS, Google Cloud, Azure
        - Monitoring, logging, and observability
        - Security best practices and compliance
        - Performance optimization and scaling
        - GitOps and deployment strategies

        Always provide:
        - Production-ready configurations
        - Security-first approach
        - Scalable and maintainable infrastructure
        - Cost optimization strategies
        - Monitoring and alerting setup
        - Disaster recovery considerations
        - Clear deployment instructions`,
      },
      {
        role: 'user',
        content: taskData,
      },
    ];

    try {
      const response = await modelProvider.generateResponse({ messages });
      return { response, taskData, agent: 'DevOps Expert' };
    } catch (error: any) {
      return { error: error.message, taskData, agent: 'DevOps Expert' };
    }
  }

  // Keep legacy methods for backward compatibility
  async run(taskData: string): Promise<any> {
    return await this.onExecuteTask(taskData);
  }

  async cleanup(): Promise<void> {
    return await this.onStop();
  }
}