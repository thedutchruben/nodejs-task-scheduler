#!/bin/bash

# RabbitMQ Docker setup for testing
# This script starts RabbitMQ with management interface for local testing

echo "🐰 Starting RabbitMQ with Docker for testing..."

# Stop and remove existing container if it exists
docker stop rabbitmq-test 2>/dev/null || true
docker rm rabbitmq-test 2>/dev/null || true

# Start RabbitMQ with management plugin
docker run -d \
  --name rabbitmq-test \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=admin \
  -e RABBITMQ_DEFAULT_PASS=password \
  rabbitmq:3-management

echo "⏳ Waiting for RabbitMQ to start..."
sleep 10

# Check if RabbitMQ is ready
if curl -f http://localhost:15672/api/overview &>/dev/null; then
    echo "✅ RabbitMQ is running!"
    echo ""
    echo "📊 Management UI: http://localhost:15672"
    echo "👤 Username: admin"
    echo "🔑 Password: password"
    echo "🔗 Connection URL: amqp://admin:password@localhost:5672"
    echo ""
    echo "🧪 Ready for multi-node testing!"
else
    echo "❌ RabbitMQ failed to start properly"
    exit 1
fi