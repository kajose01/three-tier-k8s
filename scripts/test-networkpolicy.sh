#!/usr/bin/env bash
# Proves the NetworkPolicies are enforced. Each test runs a throwaway pod with chosen labels.
set -uo pipefail
NS=three-tier
OUT="$(dirname "$0")/../evidence/networkpolicy-test.log"; : > "$OUT"
pass=0; fail=0
probe() {   # probe <name> <labels> <host:port> <expect: open|blocked>
  local name=$1 labels=$2 target=$3 expect=$4 result
  if kubectl -n $NS run "np-$name" --rm -i --restart=Never --labels="$labels" \
       --image=busybox:1.36 --command -- sh -c "nc -z -w 3 ${target%:*} ${target#*:}" >/dev/null 2>&1
  then result=open; else result=blocked; fi
  if [ "$result" = "$expect" ]; then pass=$((pass+1)); s=PASS; else fail=$((fail+1)); s=FAIL; fi
  printf '%-5s %-34s -> %-12s expected=%-7s got=%s\n' "$s" "$labels" "$target" "$expect" "$result" | tee -a "$OUT"
}
probe 1 "app=web"      api:3000    open
probe 2 "app=other"    api:3000    blocked
probe 3 "app=api"      mysql:3306  open
probe 4 "app=web"      mysql:3306  blocked
probe 5 "app=other"    mysql:3306  blocked
echo "RESULT: $pass passed, $fail failed" | tee -a "$OUT"
