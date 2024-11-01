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
export ETH_DEPLOYER_PRIVATE_KEY=<eth-deployer-private-key>
```


```bash
export OPT_DEPLOYER_PRIVATE_KEY=<opt-deployer-private-key>
```


Run script

```bash
yarn start ./path/to/config.yaml
```
