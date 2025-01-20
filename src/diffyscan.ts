import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

import dotenv from "dotenv";

import { runCommand } from "./command-utils";
import { DeployParameters } from "./config";
import env from "./env";
import { LogCallback } from "./log-utils";

export function setupDiffyscan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newContractsCfg: any,
  govBridgeExecutor: string,
  deploymentConfig: DeployParameters,
  remoteRpcUrl: string,
  localRpcUrl: string,
  chainID: string,
) {
  dotenv.populate(
    process.env as { [key: string]: string },
    {
      CHAIN_ID: chainID,
      ETHERSCAN_EXPLORER_TOKEN: env.string("L1_EXPLORER_TOKEN"),
      OPTISCAN_EXPLORER_TOKEN: env.string("L2_EXPLORER_TOKEN"),
      L1_EXPLORER_API_HOSTNAME: env.string("L1_BLOCK_EXPLORER_API_HOST"),
      L2_EXPLORER_API_HOSTNAME: env.string("L2_BLOCK_EXPLORER_API_HOST"),
      REMOTE_RPC_URL: remoteRpcUrl,
      LOCAL_RPC_URL: localRpcUrl,
      GITHUB_API_TOKEN: env.string("GITHUB_API_TOKEN"),
    },
    { override: true },
  );

  const l1Config = deploymentConfig.l1;
  const l2Config = deploymentConfig.l2;

  // l1
  const diffiscanConfigL1Name = "diffyscan_config_L1.json";
  const fileNameL1 = `./configs/${diffiscanConfigL1Name}`;
  const optimismTestnetConfigL1 = JSON.parse(readFileSync(fileNameL1, "utf8"));
  optimismTestnetConfigL1["contracts"] = {
    [newContractsCfg["ethereum"]["bridgeProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["ethereum"]["bridgeImplAddress"]]: "L1LidoTokensBridge",
    [newContractsCfg["ethereum"]["opStackTokenRatePusherImplAddress"]]: "OpStackTokenRatePusher",
  };
  optimismTestnetConfigL1["bytecode_comparison"]["constructor_args"] = {
    [newContractsCfg["ethereum"]["bridgeProxyAddress"]]: [
      newContractsCfg["ethereum"]["bridgeImplAddress"],
      l1Config.tokenBridge.bridgeAdmin,
      "0x",
    ],
    [newContractsCfg["ethereum"]["bridgeImplAddress"]]: [
      l1Config.tokenBridge.messenger,
      newContractsCfg["optimism"]["tokenBridgeProxyAddress"],
      l1Config.tokenBridge.l1NonRebasableToken,
      l1Config.tokenBridge.l1RebasableToken,
      newContractsCfg["optimism"]["tokenProxyAddress"],
      newContractsCfg["optimism"]["tokenRebasableProxyAddress"],
      l1Config.tokenBridge.accountingOracle,
    ],
    [newContractsCfg["ethereum"]["opStackTokenRatePusherImplAddress"]]: [
      l1Config.opStackTokenRatePusher.messenger,
      l1Config.opStackTokenRatePusher.wstETH,
      l1Config.opStackTokenRatePusher.accountingOracle,
      newContractsCfg["optimism"]["tokenRateOracleProxyAddress"],
      Number(l1Config.opStackTokenRatePusher.l2GasLimitForPushingTokenRate),
    ],
  };
  writeFileSync(`./artifacts/configs/${diffiscanConfigL1Name}`, JSON.stringify(optimismTestnetConfigL1, null, 2));

  // gov executor
  const diffiscanConfigL2GovName = "diffyscan_config_L2_gov.json";
  const fileNameL2Gov = `./configs/${diffiscanConfigL2GovName}`;
  const optimismTestnetConfigL2Gov = JSON.parse(readFileSync(fileNameL2Gov, "utf8"));
  optimismTestnetConfigL2Gov["contracts"] = {
    [govBridgeExecutor]: "OptimismBridgeExecutor",
  };
  optimismTestnetConfigL2Gov["bytecode_comparison"]["constructor_args"] = {
    [govBridgeExecutor]: [
      l2Config.govBridgeExecutor.ovmL2Messenger,
      l2Config.govBridgeExecutor.ethereumGovExecutor,
      Number(l2Config.govBridgeExecutor.delay),
      Number(l2Config.govBridgeExecutor.gracePeriod),
      Number(l2Config.govBridgeExecutor.minDelay),
      Number(l2Config.govBridgeExecutor.maxDelay),
      l2Config.govBridgeExecutor.ovmGuiardian,
    ],
  };
  writeFileSync(`./artifacts/configs/${diffiscanConfigL2GovName}`, JSON.stringify(optimismTestnetConfigL2Gov, null, 2));

  // L2
  const diffyscanConfigL2 = "diffyscan_config_L2.json";
  const fileNameL2 = `./configs/${diffyscanConfigL2}`;
  const optimismTestnetConfigL2 = JSON.parse(readFileSync(fileNameL2, "utf8"));
  optimismTestnetConfigL2["contracts"] = {
    [newContractsCfg["optimism"]["tokenRateOracleProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["optimism"]["tokenRateOracleImplAddress"]]: "TokenRateOracle",
    [newContractsCfg["optimism"]["tokenProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["optimism"]["tokenImplAddress"]]: "ERC20BridgedPermit",
    [newContractsCfg["optimism"]["tokenRebasableProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["optimism"]["tokenRebasableImplAddress"]]: "ERC20RebasableBridgedPermit",
    [newContractsCfg["optimism"]["tokenBridgeProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["optimism"]["tokenBridgeImplAddress"]]: "L2ERC20ExtendedTokensBridge",
  };
  optimismTestnetConfigL2["bytecode_comparison"]["constructor_args"] = {
    [newContractsCfg["optimism"]["tokenRateOracleProxyAddress"]]: [
      newContractsCfg["optimism"]["tokenRateOracleImplAddress"],
      govBridgeExecutor,
      "0x",
    ],
    [newContractsCfg["optimism"]["tokenRateOracleImplAddress"]]: [
      l2Config.tokenRateOracle.l2Messenger,
      newContractsCfg["optimism"]["tokenBridgeProxyAddress"],
      newContractsCfg["ethereum"]["opStackTokenRatePusherImplAddress"],
      Number(l2Config.tokenRateOracle.tokenRateOutdatedDelay),
      Number(l2Config.tokenRateOracle.maxAllowedL2ToL1ClockLag),
      Number(l2Config.tokenRateOracle.maxAllowedTokenRateDeviationPerDayBp),
      Number(l2Config.tokenRateOracle.oldestRateAllowedInPauseTimeSpan),
      Number(l2Config.tokenRateOracle.minTimeBetweenTokenRateUpdates),
    ],
    [newContractsCfg["optimism"]["tokenProxyAddress"]]: [
      newContractsCfg["optimism"]["tokenImplAddress"],
      govBridgeExecutor,
      "0x",
    ],
    [newContractsCfg["optimism"]["tokenImplAddress"]]: [
      l2Config.nonRebasableToken.name,
      l2Config.nonRebasableToken.symbol,
      l2Config.nonRebasableToken.signingDomainVersion,
      18,
      newContractsCfg["optimism"]["tokenBridgeProxyAddress"],
    ],
    [newContractsCfg["optimism"]["tokenRebasableProxyAddress"]]: [
      newContractsCfg["optimism"]["tokenRebasableImplAddress"],
      govBridgeExecutor,
      "0x",
    ],
    [newContractsCfg["optimism"]["tokenRebasableImplAddress"]]: [
      l2Config.rebasableToken.name,
      l2Config.rebasableToken.symbol,
      l2Config.rebasableToken.signingDomainVersion,
      18,
      newContractsCfg["optimism"]["tokenProxyAddress"],
      newContractsCfg["optimism"]["tokenRateOracleProxyAddress"],
      newContractsCfg["optimism"]["tokenBridgeProxyAddress"],
    ],
    [newContractsCfg["optimism"]["tokenBridgeProxyAddress"]]: [
      newContractsCfg["optimism"]["tokenBridgeImplAddress"],
      govBridgeExecutor,
      "0x",
    ],
    [newContractsCfg["optimism"]["tokenBridgeImplAddress"]]: [
      l2Config.tokenBridge.messenger,
      newContractsCfg["ethereum"]["bridgeProxyAddress"],
      l2Config.tokenBridge.l1NonRebasableToken,
      l2Config.tokenBridge.l1RebasableToken,
      newContractsCfg["optimism"]["tokenProxyAddress"],
      newContractsCfg["optimism"]["tokenRebasableProxyAddress"],
    ],
  };

  writeFileSync(`./artifacts/configs/${diffyscanConfigL2}`, JSON.stringify(optimismTestnetConfigL2, null, 2));
}

export async function runDiffyscanScript({
  config,
  withBinaryComparison,
  throwOnFail = true,
  tryNumber = 1,
  maxTries = 3,
  logCallback,
}: {
  config: string;
  withBinaryComparison: boolean;
  throwOnFail?: boolean;
  tryNumber?: number;
  maxTries?: number;
  logCallback: LogCallback;
}) {
  const nodeArgs = [
    "run",
    "diffyscan",
    `../artifacts/configs/${config}`,
    "--hardhat-path",
    "./hardhat_configs/automaton_hardhat_config.js",
    "--yes",
  ];
  if (withBinaryComparison) {
    nodeArgs.push("--enable-binary-comparison");
  }
  await runCommand({
    command: "poetry",
    args: nodeArgs,
    workingDirectory: "./diffyscan",
    environment: process.env,
    throwOnFail,
    tryNumber,
    maxTries,
    logCallback: logCallback,
  });
}
