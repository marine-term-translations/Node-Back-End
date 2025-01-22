#!/bin/bash

# Name of the Docker Compose file
COMPOSE_FILE="docker-compose.yml"

# Container and service details
TARGET_CONTAINER="node_server_backend"
TARGET_IMAGE="node_server_backend"

# Check if the Compose file exists
if [[ ! -f $COMPOSE_FILE ]]; then
  echo "Error: $COMPOSE_FILE not found in the current directory."
  exit 1
fi

# Step 1: Check for running containers from the Docker Compose file
RUNNING_CONTAINERS=$(docker ps --format "{{.Names}}" | grep -E "(node_server_backend|backend_proxy)")

if [[ -n $RUNNING_CONTAINERS ]]; then
  echo "The following containers are running from $COMPOSE_FILE:"
  echo "$RUNNING_CONTAINERS"
else
  echo "No containers from $COMPOSE_FILE are currently running."
fi

# Step 2: Stop the node_server_backend container if it's running
if docker ps --format "{{.Names}}" | grep -q "$TARGET_CONTAINER"; then
  echo "Stopping the container: $TARGET_CONTAINER"
  docker stop "$TARGET_CONTAINER"
else
  echo "The container $TARGET_CONTAINER is not running."
fi

# Step 3: Remove the image associated with node_server_backend
if docker images --format "{{.Repository}}" | grep -q "$TARGET_IMAGE"; then
  echo "Removing the image: $TARGET_IMAGE"
  docker rmi "$TARGET_IMAGE" --force
else
  echo "The image $TARGET_IMAGE does not exist."
fi

# Step 4: Rebuild and restart the Docker Compose services
echo "Rebuilding and restarting services from $COMPOSE_FILE..."
docker compose -f "$COMPOSE_FILE" up --build -d

# Final message
echo "Docker Compose services have been restarted."
