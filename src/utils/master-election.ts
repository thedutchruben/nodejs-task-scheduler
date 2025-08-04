import { v4 as uuidv4 } from 'uuid';
import { RabbitMQConnection } from './rabbitmq';
import { EventEmitter } from 'events';

export interface MasterElectionConfig {
  connection: RabbitMQConnection;
  nodeId?: string;
  heartbeatInterval?: number;
  leadershipTimeout?: number;
  queuePrefix?: string;
}

export enum LeadershipState {
  FOLLOWER = 'follower',
  CANDIDATE = 'candidate', 
  LEADER = 'leader'
}

export interface LeadershipEvent {
  type: 'elected' | 'demoted' | 'heartbeat';
  nodeId: string;
  timestamp: Date;
}

export class MasterElection extends EventEmitter {
  private connection: RabbitMQConnection;
  private nodeId: string;
  private state: LeadershipState = LeadershipState.FOLLOWER;
  private heartbeatInterval: number;
  private leadershipTimeout: number;
  private queuePrefix: string;
  
  private heartbeatTimer?: NodeJS.Timeout;
  private leadershipTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private electionQueue: string;
  private heartbeatQueue: string;
  private lastHeartbeat?: Date;
  private isRunning = false;
  private consumerTag?: string;

  constructor(config: MasterElectionConfig) {
    super();
    this.connection = config.connection;
    this.nodeId = config.nodeId || uuidv4();
    this.heartbeatInterval = config.heartbeatInterval || 10000; // 10 seconds
    this.leadershipTimeout = config.leadershipTimeout || 30000; // 30 seconds
    this.queuePrefix = config.queuePrefix || '';
    
    this.electionQueue = this.getQueueName('leader-election');
    this.heartbeatQueue = this.getQueueName('leader-heartbeat');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    
    // Wait for connection to be established
    await this.waitForConnection();
    
    await this.initializeQueues();
    this.startPeriodicCleanup();
    await this.startElection();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    if (this.leadershipTimer) {
      clearTimeout(this.leadershipTimer);
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    if (this.state === LeadershipState.LEADER) {
      await this.resignLeadership();
    }

    // Clean up heartbeat queue
    await this.cleanupHeartbeatQueue();

    console.log(`Node ${this.nodeId} stopped master election`);
  }

  isLeader(): boolean {
    return this.state === LeadershipState.LEADER;
  }

  getNodeId(): string {
    return this.nodeId;
  }

  getState(): LeadershipState {
    return this.state;
  }

  private async initializeQueues(): Promise<void> {
    if (!this.connection.isConnected()) {
      throw new Error('Not connected to RabbitMQ');
    }
    
    const channel = this.connection.getChannel();
    
    // Election queue - exclusive, auto-delete when connection closes
    await channel.assertQueue(this.electionQueue, {
      exclusive: false,
      durable: false,
      autoDelete: false
    });

    // Heartbeat exchange - use fanout for better distribution
    await channel.assertExchange('leader-heartbeat-exchange', 'fanout', {
      durable: false,
      autoDelete: false
    });

    // Heartbeat queue - with TTL and auto-cleanup
    await channel.assertQueue(this.heartbeatQueue, {
      exclusive: false,
      durable: false,
      autoDelete: true,
      arguments: {
        'x-message-ttl': this.heartbeatInterval * 3, // Messages expire after 3 heartbeat intervals
        'x-expires': this.leadershipTimeout * 2 // Queue expires if unused
      }
    });

    // Bind heartbeat queue to exchange
    await channel.bindQueue(this.heartbeatQueue, 'leader-heartbeat-exchange', '');
  }

  private async startElection(): Promise<void> {
    try {
      this.state = LeadershipState.CANDIDATE;
      console.log(`Node ${this.nodeId} starting election`);

      await this.attemptLeadership();
    } catch (error) {
      console.error(`Election failed for node ${this.nodeId}:`, error);
      await this.becomeFollower();
    }
  }

  private async attemptLeadership(): Promise<void> {
    if (!this.connection.isConnected()) {
      throw new Error('Not connected to RabbitMQ');
    }
    
    const channel = this.connection.getChannel();
    
    try {
      // Try to consume from election queue exclusively
      const consumerResult = await channel.consume(
        this.electionQueue,
        () => {}, // We don't process messages, just need exclusive access
        {
          exclusive: true,
          noAck: true
        }
      );

      if (consumerResult) {
        this.consumerTag = consumerResult.consumerTag;
        await this.becomeLeader();
      }
    } catch (error: any) {
      if (error.message && (error.message.includes('exclusive') || error.code === 403)) {
        // Another node is already the leader - this is expected behavior
        await this.becomeFollower();
      } else {
        throw error;
      }
    }
  }

  private async becomeLeader(): Promise<void> {
    console.log(`Node ${this.nodeId} became the leader`);
    this.state = LeadershipState.LEADER;
    this.lastHeartbeat = new Date();

    // Start sending heartbeats
    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeat();
    }, this.heartbeatInterval);

    // Set up leadership timeout monitor
    this.resetLeadershipTimeout();

    this.emit('elected', {
      type: 'elected',
      nodeId: this.nodeId,
      timestamp: new Date()
    } as LeadershipEvent);
  }

  private async becomeFollower(): Promise<void> {
    if (this.state === LeadershipState.LEADER) {
      console.log(`Node ${this.nodeId} lost leadership, becoming follower`);
      this.emit('demoted', {
        type: 'demoted',
        nodeId: this.nodeId,
        timestamp: new Date()
      } as LeadershipEvent);
    } else {
      console.log(`Node ${this.nodeId} is following, monitoring for leader changes`);
    }

    this.state = LeadershipState.FOLLOWER;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    // Start monitoring heartbeats
    await this.monitorLeaderHeartbeat();
  }

  private async sendHeartbeat(): Promise<void> {
    if (this.state !== LeadershipState.LEADER || !this.isRunning) {
      return;
    }

    try {
      if (!this.connection.isConnected()) {
        throw new Error('Not connected to RabbitMQ');
      }
      
      const channel = this.connection.getChannel();
      const heartbeatMessage = {
        nodeId: this.nodeId,
        timestamp: new Date(),
        state: this.state
      };

      await channel.publish(
        'leader-heartbeat-exchange',
        '',
        Buffer.from(JSON.stringify(heartbeatMessage)),
        { 
          persistent: false,
          expiration: (this.heartbeatInterval * 2).toString() // Message expires in 2 heartbeat intervals
        }
      );

      this.lastHeartbeat = new Date();
      this.resetLeadershipTimeout();

      this.emit('heartbeat', {
        type: 'heartbeat',
        nodeId: this.nodeId,
        timestamp: new Date()
      } as LeadershipEvent);

    } catch (error) {
      console.error(`Failed to send heartbeat from node ${this.nodeId}:`, error);
      // If we can't send heartbeat, we should step down
      await this.resignLeadership();
    }
  }

  private async monitorLeaderHeartbeat(): Promise<void> {
    if (this.state === LeadershipState.LEADER) {
      return;
    }

    try {
      if (!this.connection.isConnected()) {
        throw new Error('Not connected to RabbitMQ');
      }
      
      const channel = this.connection.getChannel();
    
      try {
        await channel.consume(
          this.heartbeatQueue,
          async (msg) => {
            if (!msg || !this.isRunning) {
              return;
            }

            try {
              const heartbeat = JSON.parse(msg.content.toString());
              
              if (heartbeat.nodeId !== this.nodeId) {
                // Received heartbeat from current leader
                this.lastHeartbeat = new Date(heartbeat.timestamp);
                this.resetLeadershipTimeout();
              }
              
              channel.ack(msg);
            } catch (error) {
              console.error('Error processing heartbeat:', error);
              try {
                channel.nack(msg, false, false);
              } catch (nackError) {
                // Ignore nack errors during cleanup
              }
            }
          },
          { noAck: false }
        );
      } catch (consumeError) {
        throw new Error(`Failed to consume heartbeat queue: ${consumeError.message}`);
      }

      // Start timeout to detect leader failure
      this.resetLeadershipTimeout();
    } catch (error: any) {
      // Suppress expected errors during election and cleanup
      const isExpectedError = error.message && (
        error.message.includes('NOT_FOUND') ||
        error.message.includes('Not connected to RabbitMQ') ||
        error.message.includes('not connected') ||
        error.code === 404 ||
        error.code === 403
      );
      
      if (!isExpectedError) {
        console.error(`Failed to monitor heartbeat for node ${this.nodeId}:`, error.message);
      }
      
      // If we can't monitor heartbeat, try to start election after a delay
      setTimeout(async () => {
        if (this.isRunning && this.state === LeadershipState.FOLLOWER) {
          try {
            await this.startElection();
          } catch (retryError: any) {
            const isRetryExpectedError = retryError.message && (
              retryError.message.includes('NOT_FOUND') ||
              retryError.message.includes('not connected') ||
              retryError.code === 404 ||
              retryError.code === 403
            );
            if (!isRetryExpectedError) {
              console.error(`Retry election failed for node ${this.nodeId}:`, retryError.message);
            }
          }
        }
      }, this.heartbeatInterval);
    }
  }

  private resetLeadershipTimeout(): void {
    if (this.leadershipTimer) {
      clearTimeout(this.leadershipTimer);
    }

    this.leadershipTimer = setTimeout(async () => {
      if (this.state === LeadershipState.FOLLOWER && this.isRunning) {
        console.log(`Node ${this.nodeId} detected leader timeout, starting new election`);
        await this.startElection();
      }
    }, this.leadershipTimeout);
  }

  private async resignLeadership(): Promise<void> {
    if (this.state !== LeadershipState.LEADER) {
      return;
    }

    console.log(`Node ${this.nodeId} resigning leadership`);

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    // Cancel exclusive consumption to allow other nodes to become leader
    try {
      if (this.consumerTag && this.connection.isConnected()) {
        const channel = this.connection.getChannel();
        await channel.cancel(this.consumerTag);
        this.consumerTag = undefined;
      }
    } catch (error) {
      console.warn('Error canceling election queue consumption:', error.message);
    }

    await this.becomeFollower();
  }

  private startPeriodicCleanup(): void {
    // Clean up heartbeat queue every minute to prevent message buildup
    this.cleanupTimer = setInterval(async () => {
      if (this.isRunning && this.state === LeadershipState.FOLLOWER) {
        try {
          if (!this.connection.isConnected()) {
            return;
          }
          
          const channel = this.connection.getChannel();
          // Only purge if queue has too many messages (check queue info)
          const queueInfo = await channel.checkQueue(this.heartbeatQueue);
          if (queueInfo.messageCount > 50) { // Threshold to prevent excessive cleanup
            await channel.purgeQueue(this.heartbeatQueue);
            console.log(`Cleaned up ${queueInfo.messageCount} old heartbeat messages for node ${this.nodeId}`);
          }
        } catch (error) {
          // Queue might not exist yet or connection issues, ignore error
          console.debug(`Cleanup error (ignored): ${error.message}`);
        }
      }
    }, 60000); // Every minute
  }

  private async cleanupHeartbeatQueue(): Promise<void> {
    try {
      if (!this.connection.isConnected()) {
        // Silently skip cleanup when not connected - this is expected during shutdown
        return;
      }
      
      const channel = this.connection.getChannel();
      
      // Purge any remaining messages from heartbeat queue
      await channel.purgeQueue(this.heartbeatQueue);
      
      // Delete the heartbeat queue if it exists and is empty
      await channel.deleteQueue(this.heartbeatQueue, { ifEmpty: true });
      
    } catch (error) {
      console.warn(`Error cleaning up heartbeat queue for node ${this.nodeId}:`, error.message);
    }
  }

  private async waitForConnection(): Promise<void> {
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 100; // 100ms
    let waitTime = 0;
    
    while (!this.connection.isConnected() && waitTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }
    
    if (!this.connection.isConnected()) {
      throw new Error('Failed to establish RabbitMQ connection within timeout period');
    }
  }

  private getQueueName(baseName: string): string {
    return this.queuePrefix ? `${this.queuePrefix}${baseName}` : baseName;
  }
}