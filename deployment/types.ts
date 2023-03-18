import "hardhat/types/config";

interface ApiData {
  apiUrl: string;
  apiKey: string;
}

/**
 * LOL
 */
export interface ApiDataConfig {
  [network: string]: ApiData;
}

declare module "hardhat/types/config" {
  interface HardhatUserConfig {
    /**
     * The name should matched with the network name in network config.
     */
    verificationApi?: ApiDataConfig;
  }

  interface HardhatConfig {
    /**
     * The name should matched with the network name in network config.
     */
    verificationApi: ApiDataConfig;
  }
}
