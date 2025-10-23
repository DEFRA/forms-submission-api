#!/bin/bash

echo "Waiting for app..."
sleep 15

count=0
max_attempts=36

until curl --fail http://localhost:3001/health; do
  echo "Still waiting... (attempt $((count+1))/$max_attempts)"

  # Every 10 attempts, show container logs to help debug
  if [ $((count % 10)) -eq 0 ] && [ $count -gt 0 ]; then
    echo "=== Container logs ==="
    docker logs forms-submission-api-app-test --tail 10 2>&1 || echo "Could not get container logs"
    echo "===================="
  fi

  sleep 5
  count=$((count+1))
  if [ $count -ge $max_attempts ]; then
    echo "App failed to start within 3 minutes"
    echo "=== Final container logs ==="
    docker logs forms-submission-api-app-test --tail 30 2>&1
    exit 1
  fi
done

echo "App ready!"
