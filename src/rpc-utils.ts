// RPC's url management

export enum NetworkType {
  Live,
  Forked,
}

export function l1RpcUrl(networkType: NetworkType): string {
  return networkType == NetworkType.Forked ? getPortUrl("L1_LOCAL_RPC_PORT") : getRpcFromEnv("L1_REMOTE_RPC_URL");
}

export function l2RpcUrl(networkType: NetworkType): string {
  return networkType == NetworkType.Forked ? getPortUrl("L2_LOCAL_RPC_PORT") : getRpcFromEnv("L2_REMOTE_RPC_URL");
}

export function localL1RpcPort(): number {
  return getPortNumber("L1_LOCAL_RPC_PORT");
}

export function localL2RpcPort(): number {
  return getPortNumber("L2_LOCAL_RPC_PORT");
}

export function diffyscanRpcUrl(): string {
  return getPortUrl("DIFFYSCAN_RPC_PORT");
}

function getPortNumber(portEnvName: string): number {
  const portNumber = Number(process.env[portEnvName]);
  if (portNumber === undefined || Number.isNaN(portNumber)) {
    console.error(`ERROR: "${portEnvName}" isn't a number`);
    process.exit(1);
  }
  return portNumber;
}

function getPortUrl(portEnvName: string): string {
  const portNumber = getPortNumber(portEnvName);
  const localhostUrl = `http://localhost:${portNumber}`;
  if (!isUrl(localhostUrl)) {
    console.error(`ERROR: Value "${localhostUrl}" from env var "${portEnvName}" is not a valid RPC url`);
    process.exit(1);
  }
  return localhostUrl;
}

function getRpcFromEnv(rpcEnvName: string): string {
  const valueFromEnv = process.env[rpcEnvName] || "";
  if (!isUrl(valueFromEnv)) {
    console.error(`ERROR: Value "${valueFromEnv}" from env var "${rpcEnvName}" is not a valid RPC url`);
    process.exit(1);
  }
  return valueFromEnv;
}

function isUrl(maybeUrl: string): boolean {
  try {
    new URL(maybeUrl);
    return true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_) {
    return false;
  }
}
