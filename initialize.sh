#!/usr/bin/env bash
set -e

echo 'The initialize script is about to start. It will install the dependencies as well as fetch submodules repositories and do all the necessary preliminary work'
sleep 5

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


