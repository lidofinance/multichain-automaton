# Multichain Automaton ⚙️

![](/assets/logo.jpg)

## Overview

**Multichain Automaton** is a sophisticated deployment and verification script designed to streamline the **deployment of stETH/wstETH [custom token bridge following reference architecture](https://docs.lido.fi/token-guides/wsteth-bridging-guide#reference-architecture-and-permissions-setup) solutions on OP Stack-compatible networks** such as OP Mainnet, Base, Zircuit, and Mode. It utilizes recommended initialization parameters and automates the verification of deployment artifacts.

## Why Use Multichain Automaton?

Multichain Automaton serves a single purpose: to facilitate the fastest possible wstETH/stETH deployments on OP Stack-compatible networks using the reference architecture without compromising security and transparency. This might position you more favorably for potential recognition of the token by the Lido DAO.

## How It Works

The script performs the following steps:

1. **Forked network deployment**: Runs the deployment on a forked environment.
2. **Artifact verification**: Verifies the state of the resulting deployment artifacts.
3. **Live network deployment**: Executes the deployment on the live environment.
4. **Real artifact verification**: Verifies the state of the real deployment artifacts.
5. **Code verification**: Checks the bytecode and source code for consistency.
6. **Storage and getter verification**: Verifies storage values and public getter results.
7. **E2E testing**: Performs comprehensive tests to ensure functionality.

## Installation

Navigate to the root folder of the project and run:

```bash
yarn install
```

This command installs all necessary dependencies for the automaton and its submodules, and compiles the contracts.

## Usage

### Environment Setup

Before running the script, set up your environment variables.

#### Deployer Private Keys

```bash
export L1_DEPLOYER_PRIVATE_KEY=<your-l1-deployer-private-key>
export L2_DEPLOYER_PRIVATE_KEY=<your-l2-deployer-private-key>
```

#### RPC URLs

```bash
export L1_REMOTE_RPC_URL=<your-l1-remote-rpc-url>
export L2_REMOTE_RPC_URL=<your-l2-remote-rpc-url>
export L1_LOCAL_RPC_URL=<your-l1-local-rpc-url>
export L2_LOCAL_RPC_URL=<your-l2-local-rpc-url>
```

#### API Tokens

Set your Etherscan tokens to fetch verified source code:

```bash
export L1_EXPLORER_TOKEN=<your-etherscan-token>
export L2_EXPLORER_TOKEN=<your-optimism-etherscan-token>
```

Set your GitHub token to avoid strict rate limiting when querying the API:

```bash
export GITHUB_API_TOKEN=<your-github-token>
```

### Running the Script

Execute the script with your configuration file:

```bash
yarn start ./path/to/config.yaml
```

> **Note**: During execution, you will be prompted to confirm certain steps in the deployment process. The entire process typically takes around 15 minutes, depending on network conditions and RPC response times.

## Contributing

Contributions are appreciated! Please read the [Contributing Guidelines](CONTRIBUTING.md) to get started.

## License

This project is licensed under the [MIT License](LICENSE).

## Contact

For any questions or feedback, please open an issue on the [GitHub repository](https://github.com/lidofinance/multichain-automaton/issues).
