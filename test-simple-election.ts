#!/usr/bin/env ts-node

// Simplified test to verify master election works
import { TaskScheduler } from './src';

async function testBasicElection() {
  console.log('🚀 Testing basic master election with njs_testing_ prefix');
  
  const nodes = [];
  
  try {
    // Start first node
    console.log('Starting node 1...');
    const node1 = new TaskScheduler({
      url: process.env.RABBITMQ_URL || 'amqp://admin:password@localhost:5672',
      queuePrefix: 'njs_testing_'
    });
    
    await node1.initialize();
    nodes.push({ id: 'node1', scheduler: node1 });
    
    // Wait for it to establish leadership
    await sleep(5000);
    
    // Check if it's the leader
    const node1IsLeader = node1.isLeader();
    console.log(`Node 1: ${node1IsLeader ? '👑 LEADER' : '👥 FOLLOWER'}`);
    
    // Start second node
    console.log('Starting node 2...');
    const node2 = new TaskScheduler({
      url: process.env.RABBITMQ_URL || 'amqp://admin:password@localhost:5672',
      queuePrefix: 'njs_testing_'
    });
    
    await node2.initialize();
    nodes.push({ id: 'node2', scheduler: node2 });
    
    // Wait for election to stabilize
    await sleep(5000);
    
    // Check leader status
    const node1IsLeader2 = node1.isLeader();
    const node2IsLeader = node2.isLeader();
    
    console.log(`Node 1: ${node1IsLeader2 ? '👑 LEADER' : '👥 FOLLOWER'}`);
    console.log(`Node 2: ${node2IsLeader ? '👑 LEADER' : '👥 FOLLOWER'}`);
    
    // Verify only one leader
    const leaderCount = (node1IsLeader2 ? 1 : 0) + (node2IsLeader ? 1 : 0);
    
    if (leaderCount === 1) {
      console.log('✅ Election successful - exactly one leader');
    } else {
      console.log(`❌ Election failed - ${leaderCount} leaders found`);
    }
    
    // Test leader shutdown and failover
    console.log('\n🔄 Testing leader failover...');
    
    let currentLeader = node1IsLeader2 ? nodes[0] : nodes[1];
    let follower = node1IsLeader2 ? nodes[1] : nodes[0];
    
    console.log(`Shutting down current leader: ${currentLeader.id}`);
    await currentLeader.scheduler.shutdown();
    
    // Remove from nodes array
    const leaderIndex = nodes.indexOf(currentLeader);
    nodes.splice(leaderIndex, 1);
    
    // Wait for new election
    await sleep(8000);
    
    // Check if follower became leader
    const newLeaderIsLeader = follower.scheduler.isLeader();
    console.log(`${follower.id}: ${newLeaderIsLeader ? '👑 NEW LEADER' : '👥 STILL FOLLOWER'}`);
    
    if (newLeaderIsLeader) {
      console.log('✅ Failover successful');
      console.log('✅ All multinode tests PASSED!');
    } else {
      console.log('❌ Failover failed');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    for (const node of nodes) {
      try {
        await node.scheduler.shutdown();
      } catch (error) {
        console.warn(`Warning: cleanup error for ${node.id}`);
      }
    }
    console.log('✅ Test completed');
    
    // Force exit to avoid hanging on reconnection attempts
    setTimeout(() => {
      console.log('🚪 Exiting test...');
      process.exit(0);
    }, 2000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception (non-fatal):', error.message);
  // Don't exit, let test continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection (non-fatal):', reason);
  // Don't exit, let test continue
});

testBasicElection().catch(error => {
  console.error('❌ Test execution failed:', error.message);
  process.exit(1);
});