#!/bin/bash
# LocalStack initialization script
# Creates S3 buckets for local development

echo "Initializing LocalStack..."

# Create S3 buckets
awslocal s3 mb s3://tci-documents
awslocal s3 mb s3://tci-recordings

echo "LocalStack initialized successfully!"
