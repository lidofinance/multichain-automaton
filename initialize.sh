#!/usr/bin/env bash
set -e

echo 'The initialize script is about to start. It will install the dependencies as well as fetch submodules repositories and do all the necessary preliminary work'
sleep 5

source ./get_env_var.sh

export L1_CHAIN_ID="$(get_env_var "L1_CHAIN_ID")"
l1_host_value="$(get_env_var "L1_BLOCK_EXPLORER_API_HOST")"
export L1_BLOCK_EXPLORER_API_URL="https://${l1_host_value}/api"
export L1_BLOCK_EXPLORER_BROWSER_URL="$(get_env_var "L1_BLOCK_EXPLORER_BROWSER_URL")"

export L2_CHAIN_ID="$(get_env_var "L2_CHAIN_ID")"
l2_host_value="$(get_env_var "L2_BLOCK_EXPLORER_API_HOST")"
export L2_BLOCK_EXPLORER_API_URL="https://${l2_host_value}/api"
export L2_BLOCK_EXPLORER_BROWSER_URL="$(get_env_var "L2_BLOCK_EXPLORER_BROWSER_URL")"

yarn

git submodule init
git submodule update

cd diffyscan
npm install
poetry install

cd ../lido-l2-with-steth
npm install
npm run compile

cd ../state-mate
yarn

cd ../governance-crosschain-bridges
npm install
npm run compile

cd ..
mkdir -p artifacts


