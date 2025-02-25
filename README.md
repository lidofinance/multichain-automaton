# Multichain Automaton ⚙️

![](/assets/logo.jpg)

## Overview

**Multichain Automaton** is a sophisticated deployment and verification script designed to streamline the **deployment of stETH/wstETH [custom token bridge following reference architecture](https://docs.lido.fi/token-guides/wsteth-bridging-guide#reference-architecture-and-permissions-setup) solutions on OP Stack-compatible networks** (such as OP Mainnet, Base, Zircuit, and Mode) with planned support for Arbitrum in the future. It utilizes recommended initialization parameters and automates the verification of deployment artifacts.

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
bash initialize.sh
```

This command installs all necessary dependencies for the automaton and its submodules, and compiles the contracts.

## Usage

### Prerequisites

- A Safe multisig must be created.
- The deployer must have sufficient gas on both networks.
- Token rate forwarding must be set up using an automatic solution, e.g., [Chainlink automation](https://docs.chain.link/chainlink-automation).

### Config Setup

Create config file using existing one for unichain (`./configs/unichain_sepolia.yaml`) as an example.

### Environment Setup

Before running the script, set up your environment variables by copying `.env.example` and fill it with your data:

```bash
cp .env.example .env
```

### Running the Script

Execute the script with your config file and default parameters:

```bash
yarn start ./path/to/config.yaml
```

You can also run the script with specific actions and showing logs in console:

```bash
yarn start ./path/to/config.yaml --actions fork deploy verify --showLogs true
```

Available actions:

- `fork` - deploy, check and test on forked network
- `deploy` - deploy on live network
- `publish-sources` - publish sources on live network
- `check` - check and test on live network
- `all` - run all actions

> **Note**: The entire process typically takes around 15 minutes, depending on network conditions and RPC response times.

### Docker

To create the image use this command with `linux/amd64` architecture:

```bash
docker buildx build --platform linux/amd64 -t <build_name> .
```

Provide .env file and path to config to run it:

```bash
docker run --env-file .env --rm \
  -v $(pwd)/configs:/app/configs \
  -v $(pwd)/artifacts:/app/artifacts \
  <build_name> ./path/to/config.yaml
```

Or you can pull and run the Docker image that builds each time a tagged branch is pushed.

```bash
docker run -t --env-file .env --rm \
  -v $(pwd)/configs:/app/configs \
  -v $(pwd)/artifacts:/app/artifacts \
  ghcr.io/lidofinance/automaton:<tag_name> ./path/to/config.yaml
```

### Logs

- `main.log` - Main script execution logs

#### Fork Deployment

- `deployment_fork_result.json` - Deployment results for forked networks
- `l1_fork_deployment_node.log` - L1 network fork deployment node logs
- `l2_fork_deployment_node.log` - L2 network fork deployment node logs
- `l1_fork_deployment_args.json` - L1 forked network deployment arguments
- `l2_fork_deployment_args.json` - L2 forked network deployment arguments
- `l2_fork_gov_executor_deployment_args.json` - L2 forked network gov executor deployment arguments

#### Live Deployment

- `deployment_live_result.json` - Deployment results for live networks
- `l1_live_deployment_node.log` - L1 network after live deployment node logs
- `l2_live_deployment_node.log` - L2 network after live deployment node logs
- `l1_live_deployment_args.json` - L1 live network deployment arguments
- `l2_live_deployment_args.json` - L2 live network deployment arguments
- `l2_live_gov_executor_deployment_args.json` - L2 live network gov executor deployment arguments

## Contributing

Contributions are appreciated! Please read the [Contributing Guidelines](CONTRIBUTING.md) to get started.

## License

This project is licensed under the [MIT License](LICENSE).

## Contact

For any questions or feedback, please open an issue on the [GitHub repository](https://github.com/lidofinance/multichain-automaton/issues).
