#!/usr/bin/env bash
set -e

echo 'Now a postinstall script runs. It might take a few minutes to finish'
sleep 3

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
