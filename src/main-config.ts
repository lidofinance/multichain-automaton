// Main Configuration Interface
interface MainConfig {
  deployParameters: DeployParameters;
  testingParameters: TestingParameters;
}

interface DeployParameters {
  forking: boolean;
  l1: L1Config;
  l2: L2Config;
}

interface L1Config {
  proxyAdmin: string;
  opStackTokenRatePusher: OpStackTokenRatePusher;
  tokenBridge: L1TokenBridge;
}

interface L2Config {
  govBridgeExecutor: GovBridgeExecutor;
  tokenRateOracle: TokenRateOracle;
  nonRebasableToken: TokenInfo;
  rebasableToken: TokenInfo;
  tokenBridge: L2TokenBridge;
}

interface OpStackTokenRatePusher {
  messenger: string;
  wstETH: string;
  accountingOracle: string;
  l2GasLimitForPushingTokenRate: number;
}

interface L1TokenBridge {
  bridgeAdmin: string;
  messenger: string;
  accountingOracle: string;
  l1NonRebasableToken: string;
  l1RebasableToken: string;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  depositsEnablers: string[];
  depositsDisablers: string[];
  withdrawalsEnablers: string[];
  withdrawalsDisablers: string[];
}

interface GovBridgeExecutor {
  ovmL2Messenger: string;
  ethereumGovExecutor: string;
  delay: number;
  gracePeriod: number;
  minDelay: number;
  maxDelay: number;
  ovmGuiardian: string;
}

interface TokenRateOracle {
  l2Messenger: string;
  tokenRateOutdatedDelay: number;
  maxAllowedL2ToL1ClockLag: number;
  maxAllowedTokenRateDeviationPerDayBp: number;
  oldestRateAllowedInPauseTimeSpan: number;
  minTimeBetweenTokenRateUpdates: number;
  updateEnabled: boolean;
  updateEnablers: string[];
  updateDisablers: string[];
  initialTokenRateValue: number;
  initialTokenRateL1Timestamp: number;
}

interface TokenInfo {
  name: string;
  symbol: string;
  signingDomainVersion: number;
}

interface L2TokenBridge {
  messenger: string;
  l1NonRebasableToken: string;
  l1RebasableToken: string;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  depositsEnablers: string[];
  depositsDisablers: string[];
  withdrawalsEnablers: string[];
  withdrawalsDisablers: string[];
}

interface TestingParameters {
  lido: string;
  accountingOracle: string;
  tokenRateNotifier: string;
  l1NonRebasableToken: string;
  l1RebasableToken: string;
  l1TokensHolder: string;
}

export {
    MainConfig,
    DeployParameters,
    L1Config,
    L2Config,
    OpStackTokenRatePusher,
    L1TokenBridge,
    GovBridgeExecutor,
    TokenRateOracle,
    TokenInfo,
    L2TokenBridge,
    TestingParameters
}