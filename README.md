# Multichain Automaton

## Install

Install dependencies in a root folder.

```bash
yarn install
```

Pull all github submodules.

```bash
git submodule update --init
```

Go to each submodule and install its dependencies.

## Usage

Setup two deployers

```bash
export L1_DEPLOYER_PRIVATE_KEY=<l1-deployer-private-key>
export L2_DEPLOYER_PRIVATE_KEY=<l2-deployer-private-key>
```

Setup rpc urls

```bash
export L1_REMOTE_RPC_URL=<l1-remote-rpc>
export L2_REMOTE_RPC_URL=<l2-remote-rpc>
export L1_LOCAL_RPC_URL=<l1-local-rpc>
export L2_LOCAL_RPC_URL=<l2-local-rpc>
```

Set your Etherscan token to fetch verified source code,

```bash
export L1_EXPLORER_TOKEN=<your-etherscan-token>
export L2_EXPLORER_TOKEN=<your-etherscan-optimism-token>
```

Set your Github token to query API without strict rate limiting,

```bash
export GITHUB_API_TOKEN=<your-github-token>
```

Run script

```bash
yarn start ./path/to/config.yaml
```
