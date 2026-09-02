#!/bin/bash

# Set a proper PATH for cron (cron has minimal PATH)
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$HOME/bin"

# Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR" || exit 1

# Set up logging
LOG_FILE="$DIR/logs/cron.log"
mkdir -p "$DIR/logs"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Function to get PM2 command
get_pm2_cmd() {
    # Try global PM2 first
    if command -v pm2 &> /dev/null; then
        echo "pm2"
        return 0
    fi
    
    # Try local PM2
    if [ -f "$DIR/node_modules/.bin/pm2" ]; then
        echo "$DIR/node_modules/.bin/pm2"
        return 0
    fi
    
    # Try npx
    if command -v npx &> /dev/null; then
        echo "npx pm2"
        return 0
    fi
    
    # Try with full path to node
    if command -v node &> /dev/null; then
        NODE_PATH=$(command -v node)
        if [ -f "$DIR/node_modules/.bin/pm2" ]; then
            echo "$NODE_PATH $DIR/node_modules/.bin/pm2"
            return 0
        fi
    fi
    
    return 1
}

# Get PM2 command
PM2_CMD=$(get_pm2_cmd)

if [ $? -ne 0 ] || [ -z "$PM2_CMD" ]; then
    log "ERROR: PM2 not found. Please install it with: npm install"
    exit 1
fi

log "Using PM2 command: $PM2_CMD"

# Check if PM2 process is already running for this app
if $PM2_CMD describe domain-shortener >> "$LOG_FILE" 2>&1; then
    log "PM2 process 'domain-shortener' is already running - restarting..."
    if $PM2_CMD restart domain-shortener >> "$LOG_FILE" 2>&1; then
        log "✓ Server restarted successfully"
    else
        log "✗ Failed to restart server"
        exit 1
    fi
else
    log "PM2 process 'domain-shortener' is not running - starting..."
    if $PM2_CMD start ecosystem.config.js >> "$LOG_FILE" 2>&1; then
        log "✓ Server started successfully"
    else
        log "✗ Failed to start server"
        exit 1
    fi
fi

