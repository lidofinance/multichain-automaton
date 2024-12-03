import 'dotenv/config'
import fs from "node:fs";
import path from "node:path";
import * as child_process from 'node:child_process'
import { strict as assert } from 'node:assert'
import process from "node:process";
import * as YAML from "yaml";
import { ethers, JsonRpcProvider } from 'ethers'
import {
  runDeployScript,
  populateDeployScriptEnvs,
  setupL2RepoTests,
  runIntegrationTest,
  copyDeploymentArtifacts,
  configFromArtifacts,
  runVerification,
  runVerificationGovExecutor,
  burnL2DeployerNonces
} from './lido-l2-with-steth';
import { runDiffyscan, setupDiffyscan } from './diffyscan';
import { setupStateMateConfig, runStateMate, setupStateMateEnvs } from './state-mate';
import { deployGovExecutor, addGovExecutorToArtifacts, saveArgs } from './gov-executor';
import { NetworkType } from './types';
import { program } from "commander";
const {once} = require('stream');

export type ChildProcess = child_process.ChildProcessWithoutNullStreams
export type TestNode = { process: ChildProcess, rpcUrl: string }

const NUM_L1_DEPLOYED_CONTRACTS = 3;

async function main() {
  console.log("start");

  const { configPath, onlyCheck, onlyForkDeploy } = parseCmdLineArgs();

  const config = loadYamlConfig(configPath);
  const deploymentConfig = config["deployParameters"];
  const testingParameters = config["testingParameters"];
  const statemateConfig = config["statemate"];

  const optProvider = new ethers.JsonRpcProvider(l2RPC(NetworkType.Real));
  const { chainId } = await optProvider.getNetwork();

  // Deploy to the forked network
  if (!onlyCheck) {
    
    const ethNodeForked = await spawnNode(l1RPC(NetworkType.Real), 8545, "l1ForkOutput.txt");
    const optNodeForked = await spawnNode(l2RPC(NetworkType.Real), 9545, "l2ForkOutput.txt");

    await burnL2DeployerNonces(l2RPC(NetworkType.Real), NUM_L1_DEPLOYED_CONTRACTS);
    const govBridgeExecutorForked = await deployGovExecutor(deploymentConfig, l2RPC(NetworkType.Forked));
    saveArgs(govBridgeExecutorForked, deploymentConfig, 'l2GovExecutorDeployArgsForked.json')

    populateDeployScriptEnvs(deploymentConfig, govBridgeExecutorForked, NetworkType.Forked);
    runDeployScript(true);
    copyDeploymentArtifacts('deployResult.json','deployResultForkedNetwork.json');
    copyDeploymentArtifacts('l1DeployArgs.json','l1DeployArgsForked.json');
    copyDeploymentArtifacts('l2DeployArgs.json','l2DeployArgsForked.json');

    let newContractsCfgForked = configFromArtifacts('deployResultForkedNetwork.json');
    addGovExecutorToArtifacts(govBridgeExecutorForked, newContractsCfgForked, 'deployResultForkedNetwork.json');
    newContractsCfgForked = configFromArtifacts('deployResultForkedNetwork.json');

    setupStateMateEnvs(
      l1RPC(NetworkType.Forked),
      l2RPC(NetworkType.Forked)
    );
    setupStateMateConfig(
      'automaton-sepolia-testnet.yaml',
      newContractsCfgForked,
      statemateConfig,
      chainId,
    );
    runStateMate('automaton-sepolia-testnet.yaml');

    setupL2RepoTests(testingParameters, govBridgeExecutorForked, newContractsCfgForked);
    runIntegrationTest("bridging-non-rebasable.integration.test.ts");
    runIntegrationTest("bridging-rebasable.integration.test.ts");
    runIntegrationTest('op-pusher-pushing-token-rate.integration.test.ts');
    runIntegrationTest('optimism.integration.test.ts');

    ethNodeForked.process.kill();
    optNodeForked.process.kill();
  }

  if (onlyForkDeploy) {
    return;
  }

  // Deploy to the real network
  if (!onlyCheck) {
    await burnL2DeployerNonces(l2RPC(NetworkType.Real), NUM_L1_DEPLOYED_CONTRACTS);

    const govBridgeExecutor = await deployGovExecutor(deploymentConfig, l2RPC(NetworkType.Real));
    saveArgs(govBridgeExecutor, deploymentConfig, 'l2GovExecutorDeployArgs.json')

    populateDeployScriptEnvs(deploymentConfig, govBridgeExecutor, NetworkType.Real);
    runDeployScript();
    copyDeploymentArtifacts('deployResult.json','deployResultRealNetwork.json');
    copyDeploymentArtifacts('l1DeployArgs.json','l1DeployArgs.json');
    copyDeploymentArtifacts('l2DeployArgs.json','l2DeployArgs.json');

    await runVerification('l1DeployArgs.json', 'eth_sepolia');
    await runVerification('l2DeployArgs.json', 'uni_sepolia');
    await runVerificationGovExecutor('l2GovExecutorDeployArgs.json', 'uni_sepolia');
    let newContractsCfgReal = configFromArtifacts('deployResultRealNetwork.json');
    addGovExecutorToArtifacts(govBridgeExecutor, newContractsCfgReal, 'deployResultRealNetwork.json');
  }
  const newContractsCfgReal = configFromArtifacts('deployResultRealNetwork.json');

  setupStateMateEnvs(
    l1RPC(NetworkType.Real),
    l2RPC(NetworkType.Real)
  );
  setupStateMateConfig(
    'automaton-sepolia-testnet.yaml',
    newContractsCfgReal,
    statemateConfig,
    chainId,
  );
  runStateMate('automaton-sepolia-testnet.yaml');

  // diffyscan + bytecode on real
  setupDiffyscan(newContractsCfgReal, newContractsCfgReal["optimism"]["govBridgeExecutor"], deploymentConfig, getRpcFromEnv("L1_REMOTE_RPC_URL"));
  runDiffyscan('optimism_testnet_config_L1.json', true);

  setupDiffyscan(newContractsCfgReal, newContractsCfgReal["optimism"]["govBridgeExecutor"], deploymentConfig, getRpcFromEnv("L2_REMOTE_RPC_URL"));
  runDiffyscan('optimism_testnet_config_L2_gov.json', true);
  runDiffyscan('optimism_testnet_config_L2.json', true);

  // run forks
  // run l2 test on them
  const ethNode = await spawnNode(l1RPC(NetworkType.Real), 8545, "l1ForkAfterDeployOutput.txt");
  const optNode = await spawnNode(l2RPC(NetworkType.Real), 9545, "l2ForkAfterDeployOutput.txt");

  setupL2RepoTests(testingParameters, newContractsCfgReal["optimism"]["govBridgeExecutor"], newContractsCfgReal);
  runIntegrationTest("bridging-non-rebasable.integration.test.ts");
  runIntegrationTest("bridging-rebasable.integration.test.ts");
  runIntegrationTest('op-pusher-pushing-token-rate.integration.test.ts');
  runIntegrationTest('optimism.integration.test.ts');

  ethNode.process.kill();
  optNode.process.kill();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function parseCmdLineArgs() {
  program
    .argument("<config-path>", "path to .yaml config file")
    .option("--onlyCheck", "only check the real network deployment")
    .option("--onlyForkDeploy", "only deploy to the forked network")
    .parse();

  const configPath = program.args[0];
  return { configPath, onlyCheck: program.getOptionValue('onlyCheck'), onlyForkDeploy: program.getOptionValue('onlyForkDeploy') };
}

function loadYamlConfig(stateFile: string) {
  const file = path.resolve(stateFile);
  const configContent = fs.readFileSync(file, "utf-8");
  const reviver = (_: unknown, v: unknown) => {
    return typeof v === "bigint" ? String(v) : v;
  };

  return YAML.parse(configContent, reviver, { schema: "core", intAsBigInt: true });
}

export async function spawnNode(rpcUrl: string, port: number, outputFileName: string) {
  const nodeCmd = 'anvil'
  const nodeArgs = [
    '--fork-url', `${rpcUrl}`,
    '-p', `${port}`,
    '--no-storage-caching'
  ]

  const output = fs.createWriteStream(`./artifacts/${outputFileName}`);
  await once(output, 'open');

  const process = child_process.spawn(nodeCmd, nodeArgs, { stdio: ['ignore', output, output] });
  console.debug(`\nSpawning test node: ${nodeCmd} ${nodeArgs.join(' ')}`)

  const localhost = `http://localhost:${port}`
  const provider = new JsonRpcProvider(localhost)
  let rpcError: Error | undefined = undefined
  for (let attempt = 0; attempt < 30; ++attempt) {
    assert(process)
    assert(process.exitCode === null)
    try {
      await provider.getBlock('latest') // check RPC is healthy
      rpcError = undefined
    } catch (e: any) {
      await new Promise((r) => setTimeout(r, 1000))
      rpcError = e
    }
  }
  if (rpcError !== undefined) {
    throw rpcError
  }

  console.debug(`\nSpawned test node: ${nodeCmd} ${nodeArgs.join(' ')}`)
  return { process, rpcUrl }
}

function l1RPC(networkType: NetworkType) {
  return networkType == NetworkType.Forked ? getRpcFromEnv("L1_LOCAL_RPC_URL") : getRpcFromEnv("L1_REMOTE_RPC_URL");
}

function l2RPC(networkType: NetworkType) {
  return networkType == NetworkType.Forked ? getRpcFromEnv("L2_LOCAL_RPC_URL") : getRpcFromEnv("L2_REMOTE_RPC_URL");
}

function getRpcFromEnv(rpcEnvName: string | undefined) {
  if (rpcEnvName === undefined) {
    console.error(`ERROR: Env "${rpcEnvName}" is undefined`);
    process.exit(1);
  }
  const valueFromEnv = process.env[rpcEnvName] || "";
  if (!isUrl(valueFromEnv)) {
    console.error(`ERROR: Value "${valueFromEnv}" from env var "${rpcEnvName}" is not a valid RPC url`);
    process.exit(1);
  }
  return valueFromEnv;
}

function isUrl(maybeUrl: string) {
  try {
    new URL(maybeUrl);
    return true;
  } catch (_) {
    return false;
  }
}
