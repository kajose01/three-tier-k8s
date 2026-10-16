# Three-Tier Application on Kubernetes

React frontend on NGINX, a Node.js API, and a MySQL database with persistent storage, deployed on Kubernetes with NetworkPolicies and tagged releases.

## 1. Problem Statement

XYZ Corporation needs a multi-tier application on Kubernetes with:

- a React frontend served by NGINX,
- a Node.js API,
- MySQL with a PersistentVolume and PersistentVolumeClaim,
- a volume shared between containers,
- a LoadBalancer Service for the frontend and ClusterIP Services for internal tiers,
- NetworkPolicies that restrict traffic between tiers,
- tagged releases.

## 2. Architecture

    Browser -> web Service (LoadBalancer :8081) -> NGINX pods (:8080)
                                                      | /api/ proxy
                                                      v
                                            api Service (ClusterIP :3000) -> API pods
                                                      |
                                                      v
                                          mysql Service (ClusterIP :3306) -> MySQL StatefulSet -> PVC (1Gi)

    Shared volume: each API pod has an emptyDir mounted by the api and log-sidecar containers.
    The API writes access.log, the sidecar tails it (kubectl logs -c log-sidecar).

## 3. Repository Layout

    api/        Node API (server.js, Dockerfile)
    frontend/   React (Vite) app, nginx.conf, multi-stage Dockerfile
    k8s/        namespace, mysql, api, web, networkpolicies
    scripts/    deploy.sh, test-networkpolicy.sh
    evidence/   smoke-test.log, networkpolicy-test.log

## 4. Steps to Build and Run

Prerequisites: a Kubernetes cluster (k3s), kubectl, Docker.

    # 1. Build and push images
    docker build -t kaj1/three-tier-api:1.0.0 api/
    docker build -t kaj1/three-tier-web:1.0.0 frontend/
    docker push kaj1/three-tier-api:1.0.0 && docker push kaj1/three-tier-web:1.0.0

    # 2. Deploy (creates the Secret with random passwords, applies policies last)
    ./scripts/deploy.sh

    # 3. Try it
    curl http://localhost:8081/api/info
    curl -X POST -H 'Content-Type: application/json' -d '{"name":"first item"}' http://localhost:8081/api/items
    curl http://localhost:8081/api/items
    kubectl -n three-tier logs deploy/api -c log-sidecar --tail=5

    # 4. Prove the NetworkPolicies are enforced
    ./scripts/test-networkpolicy.sh

## 5. NetworkPolicies and Test Results

Policies: default deny (ingress and egress), DNS egress, internet ingress to web:8080, web to api:3000, api accepts only from web, api to mysql:3306, mysql accepts only from api.

`scripts/test-networkpolicy.sh` starts throwaway pods with chosen labels and checks each connection:

| Source labels | Target | Expected | Result |
|---|---|---|---|
| app=web | api:3000 | open | PASS |
| app=other | api:3000 | blocked | PASS |
| app=api | mysql:3306 | open | PASS |
| app=web | mysql:3306 | blocked | PASS |
| app=other | mysql:3306 | blocked | PASS |

Result: 5 passed, 0 failed (`evidence/networkpolicy-test.log`). An end-to-end request through NGINX, the API and MySQL also works with the policies active (`evidence/smoke-test.log`).

## 6. Optimization Techniques Used

- **Multi-stage frontend build:** Node builds the app, and only the static files go into `nginx-unprivileged` (about 74 MB image).
- **Small, non-root images:** Alpine bases, API runs as `node`, NGINX listens on 8080 without root.
- **Secrets generated at deploy time:** random passwords go into a Kubernetes Secret and never into Git.
- **Readiness checks that follow dependencies:** the API `/ready` endpoint queries MySQL, so pods only receive traffic when the database works. The API retries the DB connection at start.
- **Resource requests and limits** on every container, including the sidecar.
- **Least-privilege networking:** default deny plus one narrow allow rule per connection.
- **Policies applied last:** `deploy.sh` lets MySQL and the API start before locking traffic down.
- **Two replicas** for web and api; MySQL data on a PVC.

## 7. Challenges Faced and Solutions

| Challenge | Solution |
|---|---|
| API and web pods stayed Pending and `deploy.sh` timed out. The pods showed no errors and no logs. | Node CPU requests were at 99% (memory only 36%) because older demo workloads on the same single node reserved CPU. Scaled the finished demos to zero replicas (PVCs kept), and the pods scheduled. |
| NetworkPolicies could silently do nothing on a cluster without an enforcing network plugin. | Wrote `test-networkpolicy.sh`, which proves both allowed and blocked paths. |
| Port 80 was already taken on the node, so a LoadBalancer on 80 would stay pending. | Exposed the web Service on port 8081. |
| Database not yet ready when the API starts. | Retry loop on start-up and a readiness probe that queries MySQL. |

## 8. Releases

| Tag | Images | Notes |
|---|---|---|
| v1.0.0 | api 1.0.0, web 1.0.0 | First release |
| v1.1.0 | api 1.1.0, web 1.1.0 | Adds `GET /api/items/count`; frontend heading shows v1.1; rolled out with zero downtime |
