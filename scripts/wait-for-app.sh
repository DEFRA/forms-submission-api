#!/bin/bash

echo "Waiting for app..."
sleep 15

count=0
max_attempts=36

until curl --fail http://localhost:3001/health; do
  echo "Still waiting..."
  sleep 5
  count=$((count+1))
  if [ $count -ge $max_attempts ]; then
    echo "App failed to start within 3 minutes"
    exit 1
  fi
done

echo "App ready!"
