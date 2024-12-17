import { strict as assert } from "node:assert";
import * as child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import "dotenv/config";
import { program } from "commander";
import { JsonRpcProvider } from "ethers";
import { once } from "stream";
import * as YAML from "yaml";

import { MainConfig } from "./config";
import {
  burnL2DeployerNonces,
  configFromArtifacts,
  copyArtifacts,
  populateDeployScriptEnvs,
  runDeployScript} from "./deploy-all-contracts";
import { addGovExecutorToDeploymentArtifacts, deployGovExecutor, saveGovExecutorDeploymentArgs } from "./deploy-gov-executor";
import { runDiffyscanScript, setupDiffyscan } from "./diffyscan";
import env from "./env";
import { runIntegrationTestsScript,setupIntegrationTests } from "./integration-tests";
import { diffyscanRpcUrl,l1RpcUrl, l2RpcUrl, localL1RpcPort, localL2RpcPort, NetworkType } from "./rpc-utils";
import { runStateMateScript, setupStateMateConfig, setupStateMateEnvs } from "./state-mate";
import { runVerificationScript, setupGovExecutorVerification } from "./verification";

const NUM_L1_DEPLOYED_CONTRACTS = 3;

function parseCmdLineArgs() {
  program
    .argument("<config-path>", "path to .yaml config file")
    .option("--onlyCheck", "only check the real network deployment")
    .option("--onlyForkDeploy", "only deploy to the forked network")
    .parse();

  const configPath = program.args[0];
  return {
    configPath,
    onlyCheck: program.getOptionValue("onlyCheck"),
    onlyForkDeploy: program.getOptionValue("onlyForkDeploy"),
  };
}

async function main() {
  console.log("start");

  const { configPath, onlyCheck, onlyForkDeploy } = parseCmdLineArgs();
  console.log(`Running script with\n  - configPath: ${configPath}\n  - onlyCheck: ${onlyCheck}\n  - onlyForkDeploy: ${onlyForkDeploy}`);

  const { mainConfig, mainConfigDoc }: {mainConfig: MainConfig, mainConfigDoc: YAML.Document} = loadYamlConfig(configPath);
  const deploymentConfig = mainConfig["deployParameters"];
  const testingParameters = mainConfig["testingParameters"];

  // FORK
  if (!onlyCheck) {    
    const l1ForkNode = await spawnNode(l1RpcUrl(NetworkType.Real), env.number("L1_CHAIN_ID"), localL1RpcPort(), "l1ForkOutput.txt");
    const l2ForkNode = await spawnNode(l2RpcUrl(NetworkType.Real), env.number("L2_CHAIN_ID"), localL2RpcPort(), "l2ForkOutput.txt");

    // Deploy on forked network
    await burnL2DeployerNonces(l2RpcUrl(NetworkType.Forked), NUM_L1_DEPLOYED_CONTRACTS);
   
    const govBridgeExecutorAddressOnFork = await deployGovExecutor(deploymentConfig, l2RpcUrl(NetworkType.Forked));
    saveGovExecutorDeploymentArgs(govBridgeExecutorAddressOnFork, deploymentConfig, "l2GovExecutorDeployArgsForked.json")

    populateDeployScriptEnvs(deploymentConfig, govBridgeExecutorAddressOnFork, NetworkType.Forked);
    runDeployScript({scriptPath: "./scripts/optimism/deploy-automaton.ts"});
    copyArtifacts({
      deploymentResult: "deploymentResultForkedNetwork.json",
      l1DeploymentArgs: "l1DeploymentArgsForked.json",
      l2DeploymentArgs: "l2DeploymentArgsForked.json"
    });

    addGovExecutorToDeploymentArtifacts(govBridgeExecutorAddressOnFork, "deploymentResultForkedNetwork.json");
    const deployedContractsOnForkedNetwork = configFromArtifacts("deploymentResultForkedNetwork.json");

    // State-mate
    setupStateMateEnvs(l1RpcUrl(NetworkType.Forked), l2RpcUrl(NetworkType.Forked));
    setupStateMateConfig("automaton.yaml", deployedContractsOnForkedNetwork, mainConfig, mainConfigDoc, env.number("L2_CHAIN_ID"));
    runStateMateScript({configName: "automaton.yaml"});

    // Integration tests
    setupIntegrationTests(testingParameters, govBridgeExecutorAddressOnFork, deployedContractsOnForkedNetwork);
    runIntegrationTestsScript({testName: "bridging-non-rebasable.integration.test.ts"});
    runIntegrationTestsScript({testName: "bridging-rebasable.integration.test.ts"});
    runIntegrationTestsScript({testName: "op-pusher-pushing-token-rate.integration.test.ts"});
    runIntegrationTestsScript({testName: "optimism.integration.test.ts"});

    l1ForkNode.process.kill();
    l2ForkNode.process.kill();
  }
  
  if (onlyForkDeploy) {
    return;
  }

  // REAL
  if (!onlyCheck) {

    // Deploy to the real network
    await burnL2DeployerNonces(l2RpcUrl(NetworkType.Real), NUM_L1_DEPLOYED_CONTRACTS);

    const govBridgeExecutor = await deployGovExecutor(deploymentConfig, l2RpcUrl(NetworkType.Real));
    saveGovExecutorDeploymentArgs(govBridgeExecutor, deploymentConfig, "l2GovExecutorDeployArgs.json")

    populateDeployScriptEnvs(deploymentConfig, govBridgeExecutor, NetworkType.Real);
    runDeployScript({scriptPath: "./scripts/optimism/deploy-automaton.ts"});
    copyArtifacts({
      deploymentResult: "deploymentResultRealNetwork.json",
      l1DeploymentArgs: "l1DeploymentArgs.json",
      l2DeploymentArgs: "l2DeploymentArgs.json"
    });
    addGovExecutorToDeploymentArtifacts(govBridgeExecutor, "deploymentResultRealNetwork.json");

    // Verification
    runVerificationScript({config: "l1DeploymentArgs.json", network: "l1", workingDirectory: "./lido-l2-with-steth"});
    runVerificationScript({config: "l2DeploymentArgs.json", network: "l2", workingDirectory: "./lido-l2-with-steth"});
    setupGovExecutorVerification();
    runVerificationScript({config: "l2GovExecutorDeployArgs.json", network: "l2", workingDirectory: "./governance-crosschain-bridges"});
  }

  const deployedContractsOnRealNetwork = configFromArtifacts("deploymentResultRealNetwork.json");

  // State-mate
  setupStateMateEnvs(l1RpcUrl(NetworkType.Real), l2RpcUrl(NetworkType.Real));
  setupStateMateConfig("automaton.yaml", deployedContractsOnRealNetwork, mainConfig, mainConfigDoc, env.number("L2_CHAIN_ID"));
  runStateMateScript({configName: "automaton.yaml"})

  // Diffyscan
  setupDiffyscan(deployedContractsOnRealNetwork, deployedContractsOnRealNetwork["optimism"]["govBridgeExecutor"], deploymentConfig, l1RpcUrl(NetworkType.Real), diffyscanRpcUrl(), env.string("L1_CHAIN_ID"));
  runDiffyscanScript({ config:"automaton_config_L1.json",  withBinaryComparison: true });

  setupDiffyscan(deployedContractsOnRealNetwork, deployedContractsOnRealNetwork["optimism"]["govBridgeExecutor"], deploymentConfig, l2RpcUrl(NetworkType.Real), diffyscanRpcUrl(), env.string("L2_CHAIN_ID"));
  runDiffyscanScript({ config:"automaton_config_L2_gov.json", withBinaryComparison: true });
  runDiffyscanScript({ config:"automaton_config_L2.json",  withBinaryComparison: true });

  // Integration tests
  const l1ForkNode = await spawnNode(l1RpcUrl(NetworkType.Real), env.number("L1_CHAIN_ID"), localL1RpcPort(), "l1ForkAfterDeployOutput.txt");
  const l2ForkNode = await spawnNode(l2RpcUrl(NetworkType.Real), env.number("L2_CHAIN_ID"), localL2RpcPort(), "l2ForkAfterDeployOutput.txt");

  setupIntegrationTests(testingParameters, deployedContractsOnRealNetwork["optimism"]["govBridgeExecutor"], deployedContractsOnRealNetwork);
  runIntegrationTestsScript({testName: "bridging-non-rebasable.integration.test.ts"});
  runIntegrationTestsScript({testName: "bridging-rebasable.integration.test.ts"});
  runIntegrationTestsScript({testName: "op-pusher-pushing-token-rate.integration.test.ts"});
  runIntegrationTestsScript({testName: "optimism.integration.test.ts"});

  l1ForkNode.process.kill();
  l2ForkNode.process.kill();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function loadYamlConfig(stateFile: string): {
  mainConfig: MainConfig;
  mainConfigDoc: YAML.Document;
} {
  const file = path.resolve(stateFile);
  const configContent = fs.readFileSync(file, "utf-8");
  const reviver = (_: unknown, v: unknown) => {
    return typeof v === "bigint" ? String(v) : v;
  };

  return {
    mainConfig: YAML.parse(configContent, reviver, { schema: "core", intAsBigInt: true }),
    mainConfigDoc: YAML.parseDocument(configContent, { intAsBigInt: true })
  };
}

async function spawnNode(rpcForkUrl: string, chainId: number, port: number, outputFileName: string) {
  const nodeCmd = "anvil";
  const nodeArgs = ["--fork-url", `${rpcForkUrl}`, "-p", `${port}`, "--no-storage-caching", "--chain-id", `${chainId}`];

  const output = fs.createWriteStream(`./artifacts/${outputFileName}`);
  await once(output, "open");

  const processInstance = child_process.spawn(nodeCmd, nodeArgs, { stdio: ["ignore", output, output] });

  console.debug(`\nSpawning test node: ${nodeCmd} ${nodeArgs.join(" ")}`);
  console.debug(`Waiting 5 seconds ...`);
  await new Promise((r) => setTimeout(r, 5000));

  const localhost = `http://localhost:${port}`;
  const provider = new JsonRpcProvider(localhost);
  let rpcError: Error | undefined = undefined;
  for (let attempt = 0; attempt < 30; ++attempt) {
    assert(processInstance);
    assert(processInstance.exitCode === null);
    try {
      await provider.getBlock("latest"); // check RPC is healthy
      rpcError = undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      await new Promise((r) => setTimeout(r, 1000));
      rpcError = e;
    }
  }
  if (rpcError !== undefined) {
    throw rpcError;
  }

  console.debug(`\nSpawned test node: ${nodeCmd} ${nodeArgs.join(" ")}`);
  return { process: processInstance, rpcUrl: rpcForkUrl };
}

