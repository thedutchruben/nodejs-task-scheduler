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
  private electionQueue: string;
  private heartbeatQueue: string;
  private lastHeartbeat?: Date;
  private isRunning = false;

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
    await this.initializeQueues();
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

    if (this.state === LeadershipState.LEADER) {
      await this.resignLeadership();
    }

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
    const channel = this.connection.getChannel();
    
    // Election queue - exclusive, auto-delete when connection closes
    await channel.assertQueue(this.electionQueue, {
      exclusive: false,
      durable: false,
      autoDelete: false
    });

    // Heartbeat queue - for leader heartbeats
    await channel.assertQueue(this.heartbeatQueue, {
      exclusive: false,
      durable: false,
      autoDelete: false
    });
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
        await this.becomeLeader();
      }
    } catch (error: any) {
      if (error.message && error.message.includes('exclusive')) {
        // Another node is already the leader
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
      const channel = this.connection.getChannel();
      const heartbeatMessage = {
        nodeId: this.nodeId,
        timestamp: new Date(),
        state: this.state
      };

      await channel.publish(
        '',
        this.heartbeatQueue,
        Buffer.from(JSON.stringify(heartbeatMessage)),
        { persistent: false }
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

    const channel = this.connection.getChannel();
    
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
          channel.nack(msg, false, false);
        }
      },
      { noAck: false }
    );

    // Start timeout to detect leader failure
    this.resetLeadershipTimeout();
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
      const channel = this.connection.getChannel();
      await channel.cancel(this.electionQueue);
    } catch (error) {
      console.warn('Error canceling election queue consumption:', error);
    }

    await this.becomeFollower();
  }

  private getQueueName(baseName: string): string {
    return this.queuePrefix ? `${this.queuePrefix}${baseName}` : baseName;
  }
}