#!/bin/bash

# Name of the Docker Compose file
COMPOSE_FILE="docker-compose.yml"
TARGET_IMAGE="node-back-end-node_server_backend"

# Check if the Compose file exists
if [[ ! -f $COMPOSE_FILE ]]; then
  echo "Error: $COMPOSE_FILE not found in the current directory."
  exit 1
fi

# Step 1: List all containers created by the Docker Compose file
echo "Checking for running containers defined by $COMPOSE_FILE..."

# Get the list of container names from the Compose file
CONTAINER_NAMES=$(docker ps --format "{{.Names}}" | grep -E "^(node_server_backend|backend_proxy)")

if [[ -n "$CONTAINER_NAMES" ]]; then
  echo "The following containers are running from $COMPOSE_FILE:"
  echo "$CONTAINER_NAMES"
else
  echo "No containers from $COMPOSE_FILE are currently running."
fi

# Step 2: Stop and remove all containers created by the Docker Compose file
for CONTAINER in $CONTAINER_NAMES; do
  echo "Stopping and removing container: $CONTAINER"
  docker stop "$CONTAINER"
  docker rm "$CONTAINER"
done

# Step 3: Remove the images associated with the containers
echo "Removing images created by the Docker Compose file..."

# Step 4: Remove the image associated with node_server_backend
if docker images --format "{{.Repository}}" | grep -q "$TARGET_IMAGE"; then
  echo "Removing the image: $TARGET_IMAGE"
  docker rmi "$TARGET_IMAGE" --force
else
  echo "The image $TARGET_IMAGE does not exist."
fi

# Step 5: Rebuild and restart the Docker Compose services
echo "Rebuilding and restarting services from $COMPOSE_FILE..."
docker compose -f "$COMPOSE_FILE" up --build -d

# Final message
echo "Docker Compose services have been restarted."