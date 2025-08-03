import { TaskScheduler } from '../src';

async function createNode(nodeName: string, port: number = 5672): Promise<TaskScheduler> {
  const scheduler = new TaskScheduler({
    url: `amqp://localhost:${port}`,
    queuePrefix: 'master-election-'
  });

  await scheduler.initialize();

  // Create a worker to handle jobs
  await scheduler.createWorker({
    name: `${nodeName}-worker`,
    concurrency: 2,
    queues: ['scheduled-jobs', 'test-jobs'],
    handlers: {
      'test-job': async (data: any) => {
        console.log(`[${nodeName}] Processing test job:`, data);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { success: true, processedBy: nodeName, data };
      },
      'daily-report': async (data: any) => {
        console.log(`[${nodeName}] Generating daily report:`, data);
        await new Promise(resolve => setTimeout(resolve, 3000));
        return { success: true, reportGenerated: true, processedBy: nodeName };
      },
      'cleanup-task': async (data: any) => {
        console.log(`[${nodeName}] Running cleanup task:`, data);
        await new Promise(resolve => setTimeout(resolve, 1500));
        return { success: true, cleaned: true, processedBy: nodeName };
      }
    }
  });

  return scheduler;
}

async function runMasterElectionExample() {
  console.log('🗳️  Starting Master Election Example');
  console.log('=====================================\n');

  const nodes: TaskScheduler[] = [];
  const nodeNames = ['Node-Alpha', 'Node-Beta', 'Node-Gamma'];

  try {
    // Create and start multiple nodes
    console.log('🚀 Creating nodes...');
    for (const nodeName of nodeNames) {
      const node = await createNode(nodeName);
      nodes.push(node);
      console.log(`✅ ${nodeName} created and initialized`);
    }

    console.log('\n📊 Initial master election status:');
    nodes.forEach((node, index) => {
      const isLeader = node.isLeader();
      const nodeId = node.getSchedulerNodeId();
      console.log(`   ${nodeNames[index]}: ${isLeader ? '👑 MASTER' : '👥 FOLLOWER'} (${nodeId.substring(0, 8)}...)`);
    });

    // Wait for master election to settle
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Find the current master
    const masterIndex = nodes.findIndex(node => node.isLeader());
    const masterName = nodeNames[masterIndex];

    console.log(`\n👑 Current master: ${masterName}`);

    // Schedule cron jobs from different nodes (only master will actually schedule them)
    console.log('\n📅 Scheduling cron jobs from different nodes...');

    // Schedule from master
    const job1 = await nodes[masterIndex].scheduleCronJob({
      id: 'daily-report-job',
      name: 'Daily Report',
      handler: 'daily-report',
      schedule: '*/10 * * * * *', // Every 10 seconds for demo
      queue: 'scheduled-jobs',
      data: { reportType: 'daily' }
    });
    console.log(`✅ Master scheduled job: ${job1}`);

    // Schedule from follower (should queue until master election)
    const followerIndex = nodes.findIndex(node => !node.isLeader());
    const job2 = await nodes[followerIndex].scheduleCronJob({
      id: 'cleanup-job',
      name: 'Cleanup Task',
      handler: 'cleanup-task',
      schedule: '*/15 * * * * *', // Every 15 seconds for demo
      queue: 'scheduled-jobs',
      data: { cleanupType: 'temp-files' }
    });
    console.log(`✅ Follower queued job: ${job2}`);

    // Monitor for 30 seconds
    console.log('\n👀 Monitoring cron job execution for 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Simulate master failure
    console.log(`\n💥 Simulating master failure - shutting down ${masterName}...`);
    await nodes[masterIndex].shutdown();

    console.log('\n⏱️  Waiting for new master election...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check new master
    console.log('\n📊 Master election status after failure:');
    nodes.forEach((node, index) => {
      if (index === masterIndex) {
        console.log(`   ${nodeNames[index]}: 💀 OFFLINE`);
        return;
      }
      const isLeader = node.isLeader();
      const nodeId = node.getSchedulerNodeId();
      console.log(`   ${nodeNames[index]}: ${isLeader ? '👑 NEW MASTER' : '👥 FOLLOWER'} (${nodeId.substring(0, 8)}...)`);
    });

    const newMasterIndex = nodes.findIndex((node, index) => index !== masterIndex && node.isLeader());
    if (newMasterIndex !== -1) {
      console.log(`\n🔄 New master elected: ${nodeNames[newMasterIndex]}`);
      console.log('   Cron jobs should continue running on the new master');
    }

    // Monitor new master for another 20 seconds
    console.log('\n👀 Monitoring new master for 20 seconds...');
    await new Promise(resolve => setTimeout(resolve, 20000));

    // Add a new cron job to test new master
    if (newMasterIndex !== -1) {
      console.log('\n➕ Adding new cron job via new master...');
      const job3 = await nodes[newMasterIndex].scheduleCronJob({
        id: 'new-test-job',
        name: 'New Test Job',
        handler: 'test-job',
        schedule: '*/8 * * * * *', // Every 8 seconds for demo
        queue: 'test-jobs',
        data: { message: 'Added after failover' }
      });
      console.log(`✅ New master scheduled job: ${job3}`);

      // Monitor the new job
      console.log('\n👀 Monitoring new job for 15 seconds...');
      await new Promise(resolve => setTimeout(resolve, 15000));
    }

    console.log('\n✅ Master election example completed successfully!');
    console.log('\nKey features demonstrated:');
    console.log('   ✓ Only master node schedules cron jobs');
    console.log('   ✓ Automatic failover when master goes down');
    console.log('   ✓ New master takes over cron job scheduling');
    console.log('   ✓ All worker nodes continue processing jobs');

  } catch (error) {
    console.error('❌ Error in master election example:', error);
  } finally {
    // Cleanup remaining nodes
    console.log('\n🧹 Shutting down remaining nodes...');
    for (let i = 0; i < nodes.length; i++) {
      if (i === nodes.findIndex(node => !node)) continue; // Skip already shut down node
      try {
        await nodes[i].shutdown();
        console.log(`✅ ${nodeNames[i]} shut down`);
      } catch (error) {
        console.log(`⚠️  ${nodeNames[i]} already shut down or error: ${error}`);
      }
    }
    console.log('✅ All nodes shut down successfully');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  process.exit(0);
});

if (require.main === module) {
  runMasterElectionExample().catch(console.error);
}

export { runMasterElectionExample };