#!/bin/sh
# Starts the API, plus the WhatsApp bridge when a linked number is used.
set -e

if [ "$WHATSAPP_MODE" = "linked" ]; then
  # A fresh secret on every start, shared only by the two processes in this container.
  BRIDGE_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  export BRIDGE_SECRET
  (
    cd bridge
    while true; do
      node index.js || true
      echo "WhatsApp bridge stopped; restarting in 5 seconds"
      sleep 5
    done
  ) &
fi

exec java $JAVA_OPTS -jar app.jar
