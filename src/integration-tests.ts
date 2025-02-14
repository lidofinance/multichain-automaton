import dotenv from "dotenv";

import { runCommand } from "./command-utils";
import { loadDeploymentArtifacts } from "./deployment-artifacts";
import { LogCallback } from "./log-utils";
import { TestingParameters } from "./main-config";
 
function setupIntegrationTests(
  {
    testingParameters,
    deploymentResultsFilename
  } : {
    testingParameters: TestingParameters,
    deploymentResultsFilename: string
  }
) {
  const deployedContracts = loadDeploymentArtifacts({fileName: deploymentResultsFilename});
  dotenv.populate(process.env as { [key: string]: string }, {
    TESTING_USE_DEPLOYED_CONTRACTS: "true",
    TESTING_OPT_L1_LIDO: testingParameters.lido,
    TESTING_OPT_L1_REBASABLE_TOKEN: testingParameters.l1RebasableToken,
    TESTING_OPT_L1_NON_REBASABLE_TOKEN: testingParameters.l1NonRebasableToken,
    TESTING_OPT_L1_ACCOUNTING_ORACLE: testingParameters.accountingOracle,
    TESTING_L1_TOKENS_HOLDER: testingParameters.l1TokensHolder,
    TESTING_OPT_GOV_BRIDGE_EXECUTOR: deployedContracts.l2.govBridgeExecutor,
    TESTING_OPT_L1_ERC20_TOKEN_BRIDGE: deployedContracts.l1.bridgeProxyAddress,
    TESTING_OPT_L1_TOKEN_RATE_NOTIFIER: testingParameters.tokenRateNotifier,
    TESTING_OPT_L1_OP_STACK_TOKEN_RATE_PUSHER: deployedContracts.l1.opStackTokenRatePusherImplAddress,
    TESTING_OPT_L2_TOKEN_RATE_ORACLE: deployedContracts.l2.tokenRateOracleProxyAddress,
    TESTING_OPT_L2_NON_REBASABLE_TOKEN: deployedContracts.l2.tokenProxyAddress,
    TESTING_OPT_L2_REBASABLE_TOKEN: deployedContracts.l2.tokenRebasableProxyAddress,
    TESTING_OPT_L2_ERC20_TOKEN_BRIDGE: deployedContracts.l2.tokenBridgeProxyAddress,
  }, { override: true });
}

async function runIntegrationTestsScript({
  testName,
  throwOnFail = true,
  tryNumber = 1,
  maxTries = 3,
  logCallback,
}: {
  testName: string;
  throwOnFail?: boolean;
  tryNumber?: number;
  maxTries?: number;
  logCallback: LogCallback;
}) {
  await runCommand({
    command: "npx",
    args: ["hardhat", "test", `./test/integration/${testName}`],
    workingDirectory: "./lido-l2-with-steth",
    environment: process.env,
    throwOnFail,
    tryNumber,
    maxTries,
    logCallback: logCallback,
  });
}

export {
    runIntegrationTestsScript,
    setupIntegrationTests
}