import { RabbitMQConnection } from './rabbitmq';

export interface NodeInfo {
  id: string;
  name: string;
  lastHeartbeat: Date;
  activeJobs: number;
  maxConcurrency: number;
  queues: string[];
  status: 'active' | 'busy' | 'offline';
}

export class LoadBalancer {
  private connection: RabbitMQConnection;
  private nodes: Map<string, NodeInfo> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private nodeId: string;
  private heartbeatIntervalMs = 30000;
  private nodeTimeoutMs = 90000;

  constructor(connection: RabbitMQConnection, nodeId: string) {
    this.connection = connection;
    this.nodeId = nodeId;
  }

  async start(): Promise<void> {
    await this.setupHeartbeatQueues();
    await this.startHeartbeat();
    await this.listenForHeartbeats();
    
    console.log(`Load balancer started for node ${this.nodeId}`);
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    await this.sendOfflineHeartbeat();
    console.log(`Load balancer stopped for node ${this.nodeId}`);
  }

  async registerNode(nodeInfo: Omit<NodeInfo, 'lastHeartbeat'>): Promise<void> {
    const fullNodeInfo: NodeInfo = {
      ...nodeInfo,
      lastHeartbeat: new Date()
    };
    
    this.nodes.set(nodeInfo.id, fullNodeInfo);
    console.log(`Node ${nodeInfo.id} registered`);
  }

  getAvailableNode(queueName: string): NodeInfo | null {
    const availableNodes = Array.from(this.nodes.values())
      .filter(node => 
        node.status === 'active' &&
        node.queues.includes(queueName) &&
        node.activeJobs < node.maxConcurrency &&
        this.isNodeAlive(node)
      )
      .sort((a, b) => {
        const loadA = a.activeJobs / a.maxConcurrency;
        const loadB = b.activeJobs / b.maxConcurrency;
        return loadA - loadB;
      });

    return availableNodes.length > 0 ? availableNodes[0] : null;
  }

  getLeastLoadedNode(queueName: string): NodeInfo | null {
    const nodes = Array.from(this.nodes.values())
      .filter(node => 
        node.queues.includes(queueName) &&
        this.isNodeAlive(node)
      )
      .sort((a, b) => {
        const loadA = a.activeJobs / a.maxConcurrency;
        const loadB = b.activeJobs / b.maxConcurrency;
        return loadA - loadB;
      });

    return nodes.length > 0 ? nodes[0] : null;
  }

  getAllNodes(): NodeInfo[] {
    return Array.from(this.nodes.values());
  }

  getActiveNodes(): NodeInfo[] {
    return Array.from(this.nodes.values())
      .filter(node => this.isNodeAlive(node));
  }

  updateNodeStatus(nodeId: string, activeJobs: number): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.activeJobs = activeJobs;
      node.lastHeartbeat = new Date();
      
      if (activeJobs >= node.maxConcurrency) {
        node.status = 'busy';
      } else {
        node.status = 'active';
      }
    }
  }

  private async setupHeartbeatQueues(): Promise<void> {
    const channel = this.connection.getChannel();
    
    await channel.assertExchange('heartbeat', 'fanout', { durable: false });
    await channel.assertQueue('heartbeat_queue', { 
      durable: false,
      autoDelete: true,
      exclusive: false
    });
    
    await channel.bindQueue('heartbeat_queue', 'heartbeat', '');
  }

  private async startHeartbeat(): Promise<void> {
    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat();
    }, this.heartbeatIntervalMs);
    
    await this.sendHeartbeat();
  }

  private async sendHeartbeat(): Promise<void> {
    const channel = this.connection.getChannel();
    
    const heartbeat = {
      nodeId: this.nodeId,
      timestamp: new Date(),
      status: 'active'
    };
    
    await channel.publish(
      'heartbeat',
      '',
      Buffer.from(JSON.stringify(heartbeat))
    );
  }

  private async sendOfflineHeartbeat(): Promise<void> {
    const channel = this.connection.getChannel();
    
    const heartbeat = {
      nodeId: this.nodeId,
      timestamp: new Date(),
      status: 'offline'
    };
    
    await channel.publish(
      'heartbeat',
      '',
      Buffer.from(JSON.stringify(heartbeat))
    );
  }

  private async listenForHeartbeats(): Promise<void> {
    const channel = this.connection.getChannel();
    
    await channel.consume('heartbeat_queue', (msg) => {
      if (msg) {
        try {
          const heartbeat = JSON.parse(msg.content.toString());
          this.processHeartbeat(heartbeat);
        } catch (error) {
          console.error('Error processing heartbeat:', error);
        }
        channel.ack(msg);
      }
    });
  }

  private processHeartbeat(heartbeat: any): void {
    const { nodeId, timestamp, status } = heartbeat;
    
    if (nodeId === this.nodeId) {
      return;
    }
    
    const node = this.nodes.get(nodeId);
    if (node) {
      node.lastHeartbeat = new Date(timestamp);
      if (status === 'offline') {
        node.status = 'offline';
      }
    }
  }

  private isNodeAlive(node: NodeInfo): boolean {
    const now = new Date();
    const timeSinceHeartbeat = now.getTime() - node.lastHeartbeat.getTime();
    return timeSinceHeartbeat < this.nodeTimeoutMs && node.status !== 'offline';
  }

  private cleanupDeadNodes(): void {
    const now = new Date();
    
    for (const [nodeId, node] of this.nodes.entries()) {
      const timeSinceHeartbeat = now.getTime() - node.lastHeartbeat.getTime();
      
      if (timeSinceHeartbeat > this.nodeTimeoutMs) {
        node.status = 'offline';
        console.log(`Node ${nodeId} marked as offline due to missed heartbeats`);
      }
    }
  }
}