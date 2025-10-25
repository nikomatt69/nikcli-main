import { Coinbase, Wallet, WalletAddress } from '@coinbase/cdp-sdk';
import { Eip712TypedData } from '../polymarket/schemas.js';

/**
 * CDP Wallet configuration
 */
export interface CdpWalletConfig {
  /**
   * Network to use (default: 'polygon')
   */
  network?: string;

  /**
   * Account label for identification
   */
  accountLabel?: string;

  /**
   * CDP API key (from CDP_API_KEY env)
   */
  apiKey?: string;

  /**
   * CDP API secret (from CDP_API_SECRET env)
   */
  apiSecret?: string;

  /**
   * Wallet ID (optional, will create if not provided)
   */
  walletId?: string;
}

/**
 * CDP Wallet wrapper for EVM operations and EIP-712 signing
 */
export class CdpWallet {
  private wallet: Wallet | null = null;
  private address: WalletAddress | null = null;
  private coinbase: Coinbase;
  private config: Required<CdpWalletConfig>;

  constructor(config: CdpWalletConfig) {
    this.config = {
      network: config.network || 'polygon',
      accountLabel: config.accountLabel || 'polymarket-trader',
      apiKey: config.apiKey || process.env.CDP_API_KEY || '',
      apiSecret: config.apiSecret || process.env.CDP_API_SECRET || '',
      walletId: config.walletId || process.env.CDP_WALLET_ID || '',
    };

    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new Error('CDP_API_KEY and CDP_API_SECRET are required');
    }

    // Initialize Coinbase SDK
    this.coinbase = new Coinbase({
      apiKeyName: this.config.apiKey,
      privateKey: this.config.apiSecret,
    });
  }

  /**
   * Get or create EVM account on the specified network
   */
  async getOrCreateEvmAccount(): Promise<{ address: string; chainId: number }> {
    try {
      // Try to fetch existing wallet
      if (this.config.walletId) {
        try {
          this.wallet = await Wallet.fetch(this.config.walletId);
          console.log(`Loaded existing wallet: ${this.config.walletId}`);
        } catch (error) {
          console.log('Wallet not found, creating new one...');
        }
      }

      // Create new wallet if not found
      if (!this.wallet) {
        this.wallet = await Wallet.create({
          networkId: this.config.network,
        });
        console.log(`Created new wallet: ${this.wallet.getId()}`);
        console.log('IMPORTANT: Save this wallet ID to CDP_WALLET_ID env variable');
      }

      // Get default address
      this.address = await this.wallet.getDefaultAddress();

      const chainId = this.config.network === 'polygon' ? 137 :
                     this.config.network === 'base' ? 8453 : 1;

      return {
        address: this.address.getId(),
        chainId,
      };
    } catch (error) {
      throw new Error(`Failed to get/create EVM account: ${error}`);
    }
  }

  /**
   * Sign EIP-712 typed data (for Polymarket orders)
   */
  async signTypedData(typedData: Eip712TypedData): Promise<{ signature: string }> {
    if (!this.address) {
      throw new Error('Wallet not initialized. Call getOrCreateEvmAccount() first');
    }

    try {
      // CDP SDK supports EIP-712 signing via signTypedData
      const payload = {
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      };

      const signature = await this.address.signTypedData(payload);

      return { signature };
    } catch (error) {
      throw new Error(`Failed to sign EIP-712 data: ${error}`);
    }
  }

  /**
   * Sign a plain message
   */
  async signMessage(message: string | Uint8Array): Promise<{ signature: string }> {
    if (!this.address) {
      throw new Error('Wallet not initialized. Call getOrCreateEvmAccount() first');
    }

    try {
      const messageStr = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const signature = await this.address.signMessage(messageStr);

      return { signature };
    } catch (error) {
      throw new Error(`Failed to sign message: ${error}`);
    }
  }

  /**
   * Get balance of native token or ERC20
   */
  async getBalance(erc20Address?: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call getOrCreateEvmAccount() first');
    }

    try {
      const balances = await this.wallet.listBalances();

      if (erc20Address) {
        // Filter for specific ERC20 token
        const tokenBalance = balances.find(b =>
          b.assetId.toLowerCase() === erc20Address.toLowerCase()
        );
        return tokenBalance?.amount || '0';
      } else {
        // Return native token balance (MATIC for Polygon)
        const nativeBalance = balances.find(b => b.assetId === 'eth' || b.assetId === 'matic');
        return nativeBalance?.amount || '0';
      }
    } catch (error) {
      throw new Error(`Failed to get balance: ${error}`);
    }
  }

  /**
   * Send a transaction
   */
  async sendTransaction(params: {
    to: string;
    value?: string;
    data?: string;
  }): Promise<string> {
    if (!this.address) {
      throw new Error('Wallet not initialized. Call getOrCreateEvmAccount() first');
    }

    try {
      const transfer = await this.address.invokeContract({
        contractAddress: params.to,
        method: 'execute',
        args: params.data ? [params.data] : [],
      });

      await transfer.wait();

      return transfer.getTransactionHash() || '';
    } catch (error) {
      throw new Error(`Failed to send transaction: ${error}`);
    }
  }

  /**
   * Get wallet address
   */
  getAddress(): string {
    if (!this.address) {
      throw new Error('Wallet not initialized. Call getOrCreateEvmAccount() first');
    }
    return this.address.getId();
  }

  /**
   * Get wallet ID (for persistence)
   */
  getWalletId(): string {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call getOrCreateEvmAccount() first');
    }
    return this.wallet.getId();
  }

  /**
   * Export wallet data (for backup)
   */
  async exportWallet(): Promise<{ walletId: string; seed?: string }> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call getOrCreateEvmAccount() first');
    }

    return {
      walletId: this.wallet.getId(),
      // Note: CDP SDK may not expose seed directly for security
    };
  }
}

/**
 * Create a new CDP wallet instance
 */
export async function createCdpWallet(config: CdpWalletConfig = {}): Promise<CdpWallet> {
  const wallet = new CdpWallet(config);
  await wallet.getOrCreateEvmAccount();
  return wallet;
}
