#!/usr/bin/env bash
# Deploys the three-tier app. Applies policies last so MySQL can pull and start first.
set -euo pipefail
cd "$(dirname "$0")/.."
kubectl apply -f k8s/00-namespace.yaml
kubectl -n three-tier get secret db-secret >/dev/null 2>&1 || \
  kubectl -n three-tier create secret generic db-secret \
    --from-literal=MYSQL_ROOT_PASSWORD="$(openssl rand -base64 18)" \
    --from-literal=MYSQL_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=')"
kubectl apply -f k8s/10-mysql.yaml
kubectl -n three-tier rollout status sts/mysql --timeout=240s
kubectl apply -f k8s/20-api.yaml -f k8s/30-web.yaml
kubectl -n three-tier rollout status deploy/api --timeout=180s
kubectl -n three-tier rollout status deploy/web --timeout=120s
kubectl apply -f k8s/40-networkpolicies.yaml
kubectl -n three-tier get pods,svc,pvc,netpol
