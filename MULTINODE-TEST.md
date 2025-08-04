# Multi-Node Master Election Testing

This directory contains tests to verify the master election functionality works correctly across multiple nodes using the `njs_testing_` prefix.

## Test Files

- `test-quick-election.ts` - **Recommended** - Fast test with clean output  
- `test-simple-election.ts` - Detailed test with full output
- `test-multinode.ts` - Comprehensive automated multi-node test
- `test-simple-multinode.ts` - Simple test for manual verification
- `run-multinode-test.sh` - Shell script to run automated tests

## Prerequisites

1. **RabbitMQ Server Running**
   ```bash
   # Using Docker
   docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
   
   # Or start existing RabbitMQ service
   brew services start rabbitmq  # macOS
   sudo systemctl start rabbitmq-server  # Linux
   ```

2. **Project Built**
   ```bash
   npm run build
   ```

## Running Tests

### Quick Test (Recommended)

Run the fast, clean test with minimal output:

```bash
# Start RabbitMQ (if not running)
./docker-rabbitmq.sh

# Run quick test
export RABBITMQ_URL="amqp://admin:password@localhost:5672"
npx ts-node test-quick-election.ts
```

### Automated Test Suite

Run the comprehensive automated test:

```bash
# Make script executable (Linux/macOS)
chmod +x run-multinode-test.sh

# Run the test
./run-multinode-test.sh

# Or run directly with ts-node
npx ts-node test-multinode.ts
```

**What the automated test does:**
1. Starts 3 nodes with `njs_testing_` prefix
2. Verifies single leader election
3. Tests job scheduling and distribution
4. Tests leader failover (shuts down leader)
5. Verifies new leader election
6. Tests job distribution across remaining nodes
7. Cleans up all resources

### Manual Testing

For manual verification, run nodes in separate terminals:

**Terminal 1 (Leader + Scheduler):**
```bash
npx ts-node test-simple-multinode.ts node1 scheduler
```

**Terminal 2 (Worker):**
```bash
npx ts-node test-simple-multinode.ts node2
```

**Terminal 3 (Worker):**
```bash
npx ts-node test-simple-multinode.ts node3
```

**What you should see:**
- One node becomes leader (👑 LEADER)
- Other nodes become followers (👥 FOLLOWER)
- Jobs scheduled by node1 are processed by any available node
- Status updates every 10 seconds
- Jobs scheduled every 15 seconds

### Testing Leader Failover

1. Start multiple nodes as shown above
2. Note which node is the leader
3. Stop the leader node (Ctrl+C)
4. Watch other nodes - one should become the new leader
5. Jobs should continue processing normally

## Expected Behavior

### ✅ Correct Behavior
- Only one leader at any time
- All nodes can process jobs from the queue
- Leader failover happens automatically
- Jobs are distributed across available nodes
- Queues use `njs_testing_` prefix

### ❌ Issues to Watch For
- Multiple leaders elected simultaneously
- Split-brain scenarios
- Connection errors during election
- Jobs stuck in queue
- Resource leaks (queues not cleaned up)

## Troubleshooting

### Connection Errors
```
Error: Not connected to RabbitMQ
```
- Ensure RabbitMQ is running
- Check connection URL in environment variable
- Verify network connectivity

### Access Refused Errors
```
ACCESS_REFUSED - queue 'njs_testing_leader-election' in exclusive use
```
- This is expected when multiple nodes compete for leadership
- Should resolve automatically with follower election

### No Leader Elected
- Check RabbitMQ server is accessible
- Verify queue permissions
- Look for connection timeouts

## Cleanup

The tests automatically clean up their resources, but if needed, you can manually clean up:

```bash
# Connect to RabbitMQ management
http://localhost:15672

# Delete queues with njs_testing_ prefix
# Or use rabbitmqctl:
sudo rabbitmqctl list_queues | grep njs_testing
sudo rabbitmqctl delete_queue njs_testing_leader-election
sudo rabbitmqctl delete_queue njs_testing_leader-heartbeat
```

## Environment Variables

- `RABBITMQ_URL` - RabbitMQ connection URL (default: `amqp://localhost:5672`)

## Test Results

When tests pass, you should see:
- ✅ Single leader elected
- ✅ Jobs scheduled successfully  
- ✅ Leader failover completed successfully
- ✅ All multi-node tests completed successfully!