#!/bin/bash

# Multi-node test runner script
# This script runs the multi-node test with proper environment setup

set -e

echo "🚀 Multi-Node Master Election Test Runner"
echo "========================================"

# Check if RabbitMQ is running
echo "📡 Checking RabbitMQ connection..."
if ! curl -f http://localhost:15672/api/overview &>/dev/null; then
    echo "❌ RabbitMQ management interface not accessible at localhost:15672"
    echo "Please ensure RabbitMQ is running with management plugin enabled"
    exit 1
fi

# Set default RabbitMQ URL if not provided
export RABBITMQ_URL=${RABBITMQ_URL:-"amqp://admin:password@localhost:5672"}

echo "🔗 Using RabbitMQ URL: $RABBITMQ_URL"

# Build the project first
echo "🔨 Building project..."
npm run build

# Run the multi-node test
echo "🧪 Starting multi-node test..."
npx ts-node test-multinode.ts

echo "✅ Multi-node test completed!"