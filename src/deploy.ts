import { strict as assert } from "node:assert";
import * as child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import "dotenv/config";
import { program } from "commander";
import { ethers, JsonRpcProvider } from "ethers";
import { once } from "stream";
import * as YAML from "yaml";

import { runDiffyscan, setupDiffyscan } from "./diffyscan";
import { addGovExecutorToArtifacts, deployGovExecutor, saveArgs } from "./gov-executor";
import {
  burnL2DeployerNonces,
  configFromArtifacts,
  copyDeploymentArtifacts,
  populateDeployScriptEnvs,
  runDeployScript,
  runIntegrationTest,
  runVerification,
  runVerificationGovExecutor,
  setupL2RepoTests,
} from "./lido-l2-with-steth";
import { runStateMate, setupStateMateConfig, setupStateMateEnvs } from "./state-mate";
import { NetworkType, l1RpcUrl, l2RpcUrl, localL1RpcPort, localL2RpcPort, diffyscanRpcUrl } from "./rpc-utils";

export type ChildProcess = child_process.ChildProcessWithoutNullStreams;
export type TestNode = { process: ChildProcess; rpcUrl: string };

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

  const { mainConfig, mainConfigDoc } = loadYamlConfig(configPath);
  
  const deploymentConfig = mainConfig["deployParameters"];
  const testingParameters = mainConfig["testingParameters"];

  const l2Provider = new ethers.JsonRpcProvider(l2RpcUrl(NetworkType.Real));
  const { chainId } = await l2Provider.getNetwork();

  // Deploy to the forked network
  if (!onlyCheck) {    
    const l1ForkNode = await spawnNode(l1RpcUrl(NetworkType.Real), Number(process.env.L1_CHAIN_ID), localL1RpcPort(), "l1ForkOutput.txt");
    const l2ForkNode = await spawnNode(l2RpcUrl(NetworkType.Real), Number(process.env.L2_CHAIN_ID), localL2RpcPort(), "l2ForkOutput.txt");

    await burnL2DeployerNonces(l2RpcUrl(NetworkType.Forked), NUM_L1_DEPLOYED_CONTRACTS);

    const govBridgeExecutorForked = await deployGovExecutor(deploymentConfig, l2RpcUrl(NetworkType.Forked));
    saveArgs(govBridgeExecutorForked, deploymentConfig, "l2GovExecutorDeployArgsForked.json")

    populateDeployScriptEnvs(deploymentConfig, govBridgeExecutorForked, NetworkType.Forked);
    runDeployScript({ throwOnFail: true });
    copyDeploymentArtifacts("deployResult.json", "deployResultForkedNetwork.json");
    copyDeploymentArtifacts("l1DeployArgs.json", "l1DeployArgsForked.json");
    copyDeploymentArtifacts("l2DeployArgs.json", "l2DeployArgsForked.json");

    let newContractsCfgForked = configFromArtifacts("deployResultForkedNetwork.json");
    addGovExecutorToArtifacts(govBridgeExecutorForked, newContractsCfgForked, "deployResultForkedNetwork.json");
    newContractsCfgForked = configFromArtifacts("deployResultForkedNetwork.json");

    setupStateMateEnvs(l1RpcUrl(NetworkType.Forked), l2RpcUrl(NetworkType.Forked));
    setupStateMateConfig("automaton.yaml", newContractsCfgForked, mainConfig, mainConfigDoc, Number(process.env.L2_CHAIN_ID));
    runStateMate("automaton.yaml");

    setupL2RepoTests(testingParameters, govBridgeExecutorForked, newContractsCfgForked);
    runIntegrationTest("bridging-non-rebasable.integration.test.ts");
    runIntegrationTest("bridging-rebasable.integration.test.ts");
    runIntegrationTest("op-pusher-pushing-token-rate.integration.test.ts");
    runIntegrationTest("optimism.integration.test.ts");

    l1ForkNode.process.kill();
    l2ForkNode.process.kill();
  }
  
  if (onlyForkDeploy) {
    return;
  }

  // Deploy to the real network
  if (!onlyCheck) {
    await burnL2DeployerNonces(l2RpcUrl(NetworkType.Real), NUM_L1_DEPLOYED_CONTRACTS);

    const govBridgeExecutor = await deployGovExecutor(deploymentConfig, l2RpcUrl(NetworkType.Real));
    saveArgs(govBridgeExecutor, deploymentConfig, "l2GovExecutorDeployArgs.json")

    populateDeployScriptEnvs(deploymentConfig, govBridgeExecutor, NetworkType.Real);
    runDeployScript({ throwOnFail: true });
    copyDeploymentArtifacts("deployResult.json", "deployResultRealNetwork.json");
    copyDeploymentArtifacts("l1DeployArgs.json", "l1DeployArgs.json");
    copyDeploymentArtifacts("l2DeployArgs.json", "l2DeployArgs.json");

    await runVerification("l1DeployArgs.json", "l1");
    await runVerification("l2DeployArgs.json", "l2");
    await runVerificationGovExecutor("l2GovExecutorDeployArgs.json", "l2");
    const newContractsCfgReal = configFromArtifacts("deployResultRealNetwork.json");
    addGovExecutorToArtifacts(govBridgeExecutor, newContractsCfgReal, "deployResultRealNetwork.json");
  }
  const newContractsCfgReal = configFromArtifacts("deployResultRealNetwork.json");

  setupStateMateEnvs(l1RpcUrl(NetworkType.Real), l2RpcUrl(NetworkType.Real));
  setupStateMateConfig("automaton.yaml", newContractsCfgReal, mainConfig, mainConfigDoc, Number(process.env.L2_CHAIN_ID));
  runStateMate("automaton.yaml");

  // diffyscan + bytecode on real
  setupDiffyscan(newContractsCfgReal, newContractsCfgReal["optimism"]["govBridgeExecutor"], deploymentConfig, l1RpcUrl(NetworkType.Real), diffyscanRpcUrl());
  runDiffyscan("optimism_testnet_config_L1.json", true);

  setupDiffyscan(newContractsCfgReal, newContractsCfgReal["optimism"]["govBridgeExecutor"], deploymentConfig, l2RpcUrl(NetworkType.Real), diffyscanRpcUrl());
  runDiffyscan("optimism_testnet_config_L2_gov.json", true);
  runDiffyscan("optimism_testnet_config_L2.json", true);

  // run forks
  // run l2 test on them
  const l1ForkNode = await spawnNode(l1RpcUrl(NetworkType.Real), Number(process.env.L1_CHAIN_ID), localL1RpcPort(), "l1ForkAfterDeployOutput.txt");
  const l2ForkNode = await spawnNode(l2RpcUrl(NetworkType.Real), Number(process.env.L2_CHAIN_ID), localL2RpcPort(), "l2ForkAfterDeployOutput.txt");

  setupL2RepoTests(testingParameters, newContractsCfgReal["optimism"]["govBridgeExecutor"], newContractsCfgReal);
  runIntegrationTest("bridging-non-rebasable.integration.test.ts");
  runIntegrationTest("bridging-rebasable.integration.test.ts");
  runIntegrationTest("op-pusher-pushing-token-rate.integration.test.ts");
  runIntegrationTest("optimism.integration.test.ts");

  l1ForkNode.process.kill();
  l2ForkNode.process.kill();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function loadYamlConfig(stateFile: string) {
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

