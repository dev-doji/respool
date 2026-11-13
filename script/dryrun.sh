#!/usr/bin/env bash
# Rehearse the full deployment on local forks of Lasna, Unichain Sepolia and Base Sepolia.
# Nothing is sent to a real network. Uses anvil's public test account. Output goes to deployments/dryrun/.
#
#   bash script/dryrun.sh
#
# Note: a fork runs the contracts but does not run Reactive Network, so no callbacks are delivered here.
set -euo pipefail
cd "$(dirname "$0")/.."

L_PORT=8645 U_PORT=8646 B_PORT=8647
anvil --fork-url "${LASNA_RPC:-https://lasna-rpc.rnk.dev/}" --port $L_PORT --silent &
P1=$!
anvil --fork-url "${UNICHAIN_SEPOLIA_RPC:-https://sepolia.unichain.org}" --port $U_PORT --silent &
P2=$!
anvil --fork-url "${BASE_SEPOLIA_RPC:-https://sepolia.base.org}" --port $B_PORT --silent &
P3=$!
trap 'kill $P1 $P2 $P3 2>/dev/null || true' EXIT

for p in $L_PORT $U_PORT $B_PORT; do
  until cast chain-id --rpc-url http://127.0.0.1:$p >/dev/null 2>&1; do sleep 1; done
done

export PRIVATE_KEY
PRIVATE_KEY=$(cast wallet private-key "test test test test test test test test test test test junk")
export DEPLOY_DIR=deployments/dryrun
export FOUNDRY_BROADCAST=deployments/dryrun/broadcast
rm -rf "$DEPLOY_DIR" && mkdir -p "$DEPLOY_DIR"

run() { echo "### $1 on $2"; forge script "script/$1" --rpc-url "http://127.0.0.1:$2" --broadcast --slow -q; }

run DeployBrain.s.sol $L_PORT
BRAIN=$(grep -o '0x[0-9a-fA-F]\{40\}' "$DEPLOY_DIR/5318007.json")
export BRAIN
run DeployChain.s.sol $U_PORT
run DeployChain.s.sol $B_PORT
run ConfigureBrain.s.sol $L_PORT
run Bootstrap.s.sol $U_PORT
run Bootstrap.s.sol $B_PORT
run Swap.s.sol $U_PORT
echo "Dry run OK. Addresses: $DEPLOY_DIR/*.json"
