#!/bin/bash

# Usage: ./test-api.sh [request-file]
# If no file specified, uses requests/explore-db-switch.json

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REQUEST_FILE="${1:-$SCRIPT_DIR/requests/explore-db-switch.json}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BASENAME=$(basename "$REQUEST_FILE" .json)
OUTPUT_FILE="$SCRIPT_DIR/responses/${BASENAME}-${TIMESTAMP}.json"

echo "Request: $REQUEST_FILE"
echo "Output:  $OUTPUT_FILE"
echo ""

curl -s -X POST http://localhost:3000/api/decision/run \
  -H "Content-Type: application/json" \
  -d @"$REQUEST_FILE" | node -e "
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => {
      const formatted = JSON.stringify(JSON.parse(data), null, 2);
      console.log(formatted);
      require('fs').writeFileSync('$OUTPUT_FILE', formatted);
    });
  "

echo ""
echo "Saved to: $OUTPUT_FILE"
