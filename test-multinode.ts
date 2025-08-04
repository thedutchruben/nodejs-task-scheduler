#!/usr/bin/env ts-node

import { TaskScheduler } from './src';

interface NodeTestConfig {
  nodeId: string;
  port: number;
  isLeaderExpected?: boolean;
}

class MultiNodeTester {
  private nodes: Map<string, TaskScheduler> = new Map();
  private nodeConfigs: NodeTestConfig[] = [
    { nodeId: 'node-1', port: 3001, isLeaderExpected: true },
    { nodeId: 'node-2', port: 3002 },
    { nodeId: 'node-3', port: 3003 }
  ];

  async runTest(): Promise<void> {
    console.log('🚀 Starting multi-node master election test with prefix: njs_testing_');
    
    try {
      // Start all nodes
      await this.startAllNodes();
      
      // Wait for election to stabilize
      console.log('⏳ Waiting for master election to stabilize...');
      await this.sleep(5000);
      
      // Check initial leader
      await this.checkLeaderStatus();
      
      // Test basic job scheduling
      await this.testJobScheduling();
      
      console.log('⏳ Waiting for jobs to process...');
      await this.sleep(8000);
      
      // Test leader failover (simplified)
      await this.testLeaderFailover();
      
      console.log('✅ All multi-node tests completed successfully!');
      
    } catch (error) {
      console.error('❌ Multi-node test failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  private async startAllNodes(): Promise<void> {
    console.log('📡 Starting nodes...');
    
    for (const config of this.nodeConfigs) {
      console.log(`Starting ${config.nodeId}...`);
      const scheduler = new TaskScheduler({
        url: process.env.RABBITMQ_URL || 'amqp://admin:password@localhost:5672',
        queuePrefix: 'njs_testing_'
      });

      await scheduler.initialize();
      
      // Wait a bit for full initialization
      await this.sleep(2000);
      
      this.nodes.set(config.nodeId, scheduler);
      
      // Create a worker on each node
      await scheduler.createWorker({
        name: `${config.nodeId}-worker`,
        concurrency: 2,
        queues: ['test-jobs'],
        handlers: {
          'test-job': async (data: any) => {
            console.log(`📋 ${config.nodeId} processing job:`, data.jobId);
            await this.sleep(1000); // Simulate work
            return { 
              success: true, 
              processedBy: config.nodeId,
              timestamp: new Date()
            };
          },
          'priority-job': async (data: any) => {
            console.log(`⭐ ${config.nodeId} processing priority job:`, data.jobId);
            return { 
              success: true, 
              processedBy: config.nodeId,
              priority: true
            };
          }
        }
      });
      
      console.log(`✅ ${config.nodeId} started and ready`);
      
      // Stagger node startup to avoid race conditions
      await this.sleep(1000);
    }
  }

  private async checkLeaderStatus(): Promise<void> {
    console.log('\n👑 Checking leader election status...');
    
    let leaderCount = 0;
    let leaderNode = '';
    
    for (const [nodeId, scheduler] of this.nodes) {
      const nodeInfo = await scheduler.getNodeInfo();
      // @ts-ignore
      const isLeader = nodeInfo.isLeader;
      
      console.log(`${nodeId}: ${isLeader ? '👑 LEADER' : '👥 FOLLOWER'} (Node ID: ${nodeInfo.nodeId})`);
      
      if (isLeader) {
        leaderCount++;
        leaderNode = nodeId;
      }
    }
    
    if (leaderCount === 0) {
      throw new Error('No leader elected!');
    } else if (leaderCount > 1) {
      throw new Error(`Multiple leaders detected: ${leaderCount}`);
    } else {
      console.log(`✅ Single leader elected: ${leaderNode}`);
    }
  }

  private async testJobScheduling(): Promise<void> {
    console.log('\n📋 Testing job scheduling...');
    
    // Get any scheduler to schedule jobs (should work from any node)
    const scheduler = this.nodes.values().next().value;
    
    // Schedule a few test jobs
    for (let i = 1; i <= 3; i++) {
      try {
        await scheduler.scheduleJob({
          id: `test-job-${i}`,
          name: `Test Job ${i}`,
          handler: 'test-job',
          data: { jobId: `test-job-${i}`, message: `Hello from job ${i}` }
        });
        console.log(`✅ Job ${i} scheduled`);
      } catch (error) {
        console.error(`❌ Failed to schedule job ${i}:`, error.message);
      }
    }
  }

  private async testLeaderFailover(): Promise<void> {
    console.log('\n🔄 Testing leader failover...');
    
    // Find current leader
    let currentLeader = '';
    for (const [nodeId, scheduler] of this.nodes) {
      const nodeInfo = await scheduler.getNodeInfo();
        // @ts-ignore
      if (nodeInfo.isLeader) {
        currentLeader = nodeId;
        break;
      }
    }
    
    if (!currentLeader) {
      throw new Error('No leader found for failover test');
    }
    
    console.log(`🛑 Shutting down current leader: ${currentLeader}`);
    
    // Shutdown the leader
    const leaderScheduler = this.nodes.get(currentLeader)!;
    await leaderScheduler.shutdown();
    this.nodes.delete(currentLeader);
    
    // Wait for new election
    console.log('⏳ Waiting for new leader election...');
    await this.sleep(8000);
    
    // Check new leader
    await this.checkLeaderStatus();
    
    console.log('✅ Leader failover completed successfully');
  }

  private async testJobDistribution(): Promise<void> {
    console.log('\n⚖️ Testing job distribution across remaining nodes...');
    
    // Get any remaining scheduler
    const scheduler = this.nodes.values().next().value;
    
    // Schedule jobs that should be distributed
    const jobPromises = [];
    for (let i = 1; i <= 6; i++) {
      const jobPromise = scheduler.scheduleJob({
        id: `distributed-job-${i}`,
        name: `Distributed Job ${i}`,
        handler: 'test-job',
        data: { jobId: `distributed-job-${i}`, message: `Distributed job ${i}` }
      });
      jobPromises.push(jobPromise);
    }
    
    await Promise.all(jobPromises);
    console.log('✅ Distributed jobs scheduled');
    
    // Wait for processing
    await this.sleep(10000);
  }

  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up test resources...');
    
    for (const [nodeId, scheduler] of this.nodes) {
      try {
        console.log(`Shutting down ${nodeId}...`);
        await scheduler.shutdown();
      } catch (error) {
        console.warn(`Warning: Error shutting down ${nodeId}:`, error.message || error);
      }
    }
    
    this.nodes.clear();
    
    // Give time for cleanup
    await this.sleep(2000);
    
    console.log('✅ Cleanup completed');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down test...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down test...');
  process.exit(0);
});

// Run the test
if (require.main === module) {
  const tester = new MultiNodeTester();
  tester.runTest().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

export { MultiNodeTester };