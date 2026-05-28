#!/usr/bin/env sh

# Example usage:
# ./with-redis-and-db.sh psql -c 'select 1;'
# ./with-redis-and-db.sh redis-cli -h localhost -p 6379 ping

dir=$(dirname $0)
. ${dir}/_common.sh

SERVICES="db redis" main "$@"
