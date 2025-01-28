import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

import dotenv from "dotenv";

import { runCommand } from "./command-utils";
import { loadDeploymentArtifacts } from "./deployment-artifacts";
import env from "./env";
import { LogCallback } from "./log-utils";
import { DeployParameters } from "./main-config";

function setupDiffyscan({
  deploymentResultsFilename,
  deploymentConfig,
  remoteRpcUrl,
  localRpcUrl,
  chainID,
}: {
  deploymentResultsFilename: string,
  deploymentConfig: DeployParameters,
  remoteRpcUrl: string,
  localRpcUrl: string,
  chainID: string,
}) {
  const deployedContracts = loadDeploymentArtifacts({fileName: deploymentResultsFilename });
  const govBridgeExecutor = deployedContracts.l2.govBridgeExecutor;

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
    [deployedContracts.l1.bridgeProxyAddress]: "OssifiableProxy",
    [deployedContracts.l1.bridgeImplAddress]: "L1LidoTokensBridge",
    [deployedContracts.l1.opStackTokenRatePusherImplAddress]: "OpStackTokenRatePusher",
  };
  optimismTestnetConfigL1["bytecode_comparison"]["constructor_args"] = {
    [deployedContracts.l1.bridgeProxyAddress]: [
      deployedContracts.l1.bridgeImplAddress,
      l1Config.tokenBridge.bridgeAdmin,
      "0x",
    ],
    [deployedContracts.l1.bridgeImplAddress]: [
      l1Config.tokenBridge.messenger,
      deployedContracts.l2.tokenBridgeProxyAddress,
      l1Config.tokenBridge.l1NonRebasableToken,
      l1Config.tokenBridge.l1RebasableToken,
      deployedContracts.l2.tokenProxyAddress,
      deployedContracts.l2.tokenRebasableProxyAddress,
      l1Config.tokenBridge.accountingOracle,
    ],
    [deployedContracts.l1.opStackTokenRatePusherImplAddress]: [
      l1Config.opStackTokenRatePusher.messenger,
      l1Config.opStackTokenRatePusher.wstETH,
      l1Config.opStackTokenRatePusher.accountingOracle,
      deployedContracts.l2.tokenRateOracleProxyAddress,
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
    [deployedContracts.l2.tokenRateOracleProxyAddress]: "OssifiableProxy",
    [deployedContracts.l2.tokenRateOracleImplAddress]: "TokenRateOracle",
    [deployedContracts.l2.tokenProxyAddress]: "OssifiableProxy",
    [deployedContracts.l2.tokenImplAddress]: "ERC20BridgedPermit",
    [deployedContracts.l2.tokenRebasableProxyAddress]: "OssifiableProxy",
    [deployedContracts.l2.tokenRebasableImplAddress]: "ERC20RebasableBridgedPermit",
    [deployedContracts.l2.tokenBridgeProxyAddress]: "OssifiableProxy",
    [deployedContracts.l2.tokenBridgeImplAddress]: "L2ERC20ExtendedTokensBridge",
  };
  optimismTestnetConfigL2["bytecode_comparison"]["constructor_args"] = {
    [deployedContracts.l2.tokenRateOracleProxyAddress]: [
      deployedContracts.l2.tokenRateOracleImplAddress,
      govBridgeExecutor,
      "0x",
    ],
    [deployedContracts.l2.tokenRateOracleImplAddress]: [
      l2Config.tokenRateOracle.l2Messenger,
      deployedContracts.l2.tokenBridgeProxyAddress,
      deployedContracts.l1.opStackTokenRatePusherImplAddress,
      Number(l2Config.tokenRateOracle.tokenRateOutdatedDelay),
      Number(l2Config.tokenRateOracle.maxAllowedL2ToL1ClockLag),
      Number(l2Config.tokenRateOracle.maxAllowedTokenRateDeviationPerDayBp),
      Number(l2Config.tokenRateOracle.oldestRateAllowedInPauseTimeSpan),
      Number(l2Config.tokenRateOracle.minTimeBetweenTokenRateUpdates),
    ],
    [deployedContracts.l2.tokenProxyAddress]: [
      deployedContracts.l2.tokenImplAddress,
      govBridgeExecutor,
      "0x",
    ],
    [deployedContracts.l2.tokenImplAddress]: [
      l2Config.nonRebasableToken.name,
      l2Config.nonRebasableToken.symbol,
      l2Config.nonRebasableToken.signingDomainVersion,
      18,
      deployedContracts.l2.tokenBridgeProxyAddress,
    ],
    [deployedContracts.l2.tokenRebasableProxyAddress]: [
      deployedContracts.l2.tokenRebasableImplAddress,
      govBridgeExecutor,
      "0x",
    ],
    [deployedContracts.l2.tokenRebasableImplAddress]: [
      l2Config.rebasableToken.name,
      l2Config.rebasableToken.symbol,
      l2Config.rebasableToken.signingDomainVersion,
      18,
      deployedContracts.l2.tokenProxyAddress,
      deployedContracts.l2.tokenRateOracleProxyAddress,
      deployedContracts.l2.tokenBridgeProxyAddress,
    ],
    [deployedContracts.l2.tokenBridgeProxyAddress]: [
      deployedContracts.l2.tokenBridgeImplAddress,
      govBridgeExecutor,
      "0x",
    ],
    [deployedContracts.l2.tokenBridgeImplAddress]: [
      l2Config.tokenBridge.messenger,
      deployedContracts.l1.bridgeProxyAddress,
      l2Config.tokenBridge.l1NonRebasableToken,
      l2Config.tokenBridge.l1RebasableToken,
      deployedContracts.l2.tokenProxyAddress,
      deployedContracts.l2.tokenRebasableProxyAddress,
    ],
  };

  writeFileSync(`./artifacts/configs/${diffyscanConfigL2}`, JSON.stringify(optimismTestnetConfigL2, null, 2));
}

async function runDiffyscanScript({
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

export {
    setupDiffyscan,
    runDiffyscanScript
}