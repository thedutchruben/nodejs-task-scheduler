#!/usr/bin/env ts-node

// Quick test to verify master election works with minimal output
import { TaskScheduler } from './src';

async function quickElectionTest() {
  console.log('🚀 Quick master election test (njs_testing_ prefix)');
  
  const nodes = [];
  let testsPassed = 0;
  const totalTests = 2;
  
  try {
    // Test 1: Single leader election
    console.log('\n📋 Test 1: Single leader election');
    
    const node1 = new TaskScheduler({
      url: process.env.RABBITMQ_URL || 'amqp://admin:password@localhost:5672',
      queuePrefix: 'njs_testing_'
    });
    
    const node2 = new TaskScheduler({
      url: process.env.RABBITMQ_URL || 'amqp://admin:password@localhost:5672', 
      queuePrefix: 'njs_testing_'
    });
    
    await node1.initialize();
    await node2.initialize();
    
    nodes.push({ id: 'node1', scheduler: node1 });
    nodes.push({ id: 'node2', scheduler: node2 });
    
    // Wait for election
    await sleep(6000);
    
    const node1IsLeader = node1.isLeader();
    const node2IsLeader = node2.isLeader();
    const leaderCount = (node1IsLeader ? 1 : 0) + (node2IsLeader ? 1 : 0);
    
    if (leaderCount === 1) {
      console.log('✅ Test 1 PASSED: Exactly one leader elected');
      testsPassed++;
    } else {
      console.log(`❌ Test 1 FAILED: ${leaderCount} leaders found`);
    }
    
    // Test 2: Leader failover
    console.log('\n📋 Test 2: Leader failover');
    
    const currentLeader = node1IsLeader ? nodes[0] : nodes[1];
    const follower = node1IsLeader ? nodes[1] : nodes[0];
    
    // Shutdown leader
    await currentLeader.scheduler.shutdown();
    nodes.splice(nodes.indexOf(currentLeader), 1);
    
    // Wait for failover
    await sleep(6000);
    
    const newLeaderIsLeader = follower.scheduler.isLeader();
    
    if (newLeaderIsLeader) {
      console.log('✅ Test 2 PASSED: Failover successful');
      testsPassed++;
    } else {
      console.log('❌ Test 2 FAILED: Failover failed');
    }
    
    // Summary
    console.log(`\n📊 Test Results: ${testsPassed}/${totalTests} tests passed`);
    
    if (testsPassed === totalTests) {
      console.log('🎉 ALL TESTS PASSED! Master election is working correctly.');
      console.log('✅ njs_testing_ prefix multinode test SUCCESSFUL');
    } else {
      console.log('❌ Some tests failed. Check master election implementation.');
    }
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  } finally {
    // Quick cleanup
    for (const node of nodes) {
      try {
        await node.scheduler.shutdown();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    // Force exit
    setTimeout(() => process.exit(testsPassed === totalTests ? 0 : 1), 1000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Suppress error logs during cleanup
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

quickElectionTest();