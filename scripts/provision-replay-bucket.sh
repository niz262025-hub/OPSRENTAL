#!/usr/bin/env bash
# Provision only the disposable local replay Storage service. The caller supplies
# the disposable project's service key without printing it to the logs.
set -euo pipefail
: "${SUPABASE_REPLAY_SERVICE_KEY:?missing disposable service key}"
curl --fail --silent --show-error \
  -X POST 'http://127.0.0.1:54321/storage/v1/bucket' \
  -H "Authorization: Bearer ${SUPABASE_REPLAY_SERVICE_KEY}" \
  -H "apikey: ${SUPABASE_REPLAY_SERVICE_KEY}" \
  -H 'Content-Type: application/json' \
  --data '{"id":"opsrental-private","name":"opsrental-private","public":false,"file_size_limit":3145728}' \
  > /dev/null
