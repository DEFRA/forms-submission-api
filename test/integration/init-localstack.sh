#!/bin/bash

echo "Waiting for LocalStack to be ready..."
count=0
max_attempts=30
until curl -s http://localhost:4566/health > /dev/null; do
  echo "LocalStack not ready yet, waiting..."
  sleep 2
  count=$((count+1))
  if [ $count -ge $max_attempts ]; then
    echo "LocalStack failed to start within 1 minute"
    exit 1
  fi
done

echo "LocalStack is ready. Creating S3 bucket..."

aws --endpoint-url=http://localhost:4566 s3 mb s3://test-forms-submission-bucket --region us-east-1

echo "Creating test files in S3..."

echo "Test PDF content for integration tests" > /tmp/test-document.pdf
aws --endpoint-url=http://localhost:4566 s3 cp /tmp/test-document.pdf s3://test-forms-submission-bucket/staging/test-document.pdf --region us-east-1

echo "Batch test document 1" > /tmp/batch-document-1.pdf
aws --endpoint-url=http://localhost:4566 s3 cp /tmp/batch-document-1.pdf s3://test-forms-submission-bucket/staging/batch-document-1.pdf --region us-east-1

echo "Orphaned test document for deletion test" > /tmp/orphaned-document.pdf
aws --endpoint-url=http://localhost:4566 s3 cp /tmp/orphaned-document.pdf s3://test-forms-submission-bucket/staging/orphaned-document.pdf --region us-east-1

echo "S3 bucket and test files created successfully."

