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

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/decision/run \
  -H "Content-Type: application/json" \
  -d @"$REQUEST_FILE")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ -z "$BODY" ]; then
  echo "Empty response (HTTP $HTTP_CODE). Is the dev server running? (npm run dev)"
  echo "If the server is running, check the terminal for errors (e.g. MongoDB connection)."
  exit 1
fi

echo "$BODY" | node -e "
  let data = '';
  process.stdin.on('data', chunk => data += chunk);
  process.stdin.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      const formatted = JSON.stringify(parsed, null, 2);
      console.log(formatted);
      require('fs').writeFileSync('$OUTPUT_FILE', formatted);
    } catch (e) {
      console.error('Server did not return valid JSON:');
      console.error(data);
      process.exit(1);
    }
  });
" || exit 1

echo ""
echo "Saved to: $OUTPUT_FILE"
