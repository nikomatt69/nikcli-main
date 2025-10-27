# Web3 Toolchains

NikCLI now includes specialized Web3 toolchains for blockchain development, DeFi operations, and on-chain analysis. These toolchains provide automated workflows for complex Web3 tasks.

## Available Toolchains

### 1. DeFi Analysis (`defi-analysis`)
**Purpose**: Comprehensive DeFi protocol analysis and yield optimization
- **Chains**: Polygon, Base, Ethereum
- **Protocols**: Uniswap, Aave, Compound, Polymarket
- **Risk Level**: Medium
- **Duration**: ~45 seconds
- **Tools**: `goat_finance`, `analyze_project`, `web_search`, `generate_report`

### 2. Polymarket Strategy (`polymarket-strategy`)
**Purpose**: Automated Polymarket prediction market analysis and trading strategy
- **Chains**: Polygon
- **Protocols**: Polymarket
- **Risk Level**: High
- **Duration**: ~60 seconds
- **Tools**: `goat_finance`, `web_search`, `data_analysis`, `risk_assessment`

### 3. Portfolio Management (`portfolio-management`)
**Purpose**: Cross-chain portfolio tracking and rebalancing automation
- **Chains**: Polygon, Base, Ethereum
- **Protocols**: Multiple
- **Risk Level**: High
- **Duration**: ~90 seconds
- **Tools**: `goat_finance`, `coinbase_blockchain`, `data_visualization`, `risk_metrics`

### 4. NFT Analysis (`nft-analysis`)
**Purpose**: NFT collection analytics, rarity analysis, and market trends
- **Chains**: Ethereum, Polygon, Base
- **Protocols**: OpenSea, Blur, Foundation
- **Risk Level**: Low
- **Duration**: ~30 seconds
- **Tools**: `web_search`, `data_analysis`, `image_analysis`, `market_data`

### 5. Smart Contract Audit (`contract-audit`)
**Purpose**: Automated smart contract security analysis and vulnerability detection
- **Chains**: Ethereum, Polygon, Base, Arbitrum
- **Protocols**: Solidity
- **Risk Level**: Critical
- **Duration**: ~2 minutes
- **Tools**: `read_file`, `analyze_code`, `security_scan`, `generate_report`

### 6. Yield Optimizer (`yield-optimizer`)
**Purpose**: Automated yield farming strategy optimization across protocols
- **Chains**: Polygon, Base, Ethereum
- **Protocols**: Aave, Compound, Uniswap, Curve
- **Risk Level**: Critical
- **Duration**: ~3 minutes
- **Tools**: `goat_finance`, `yield_calculator`, `risk_assessment`, `execution_engine`

### 7. Bridge Analysis (`bridge-analysis`)
**Purpose**: Cross-chain bridge security analysis and optimal routing
- **Chains**: Ethereum, Polygon, Base, Arbitrum
- **Protocols**: Polygon Bridge, Base Bridge, Arbitrum Bridge
- **Risk Level**: High
- **Duration**: ~45 seconds
- **Tools**: `bridge_scanner`, `security_analysis`, `cost_calculator`, `route_optimizer`

### 8. MEV Protection (`mev-protection`)
**Purpose**: MEV analysis and protection strategy for transactions
- **Chains**: Ethereum, Polygon, Base
- **Protocols**: Flashbots, CoW Protocol
- **Risk Level**: High
- **Duration**: ~30 seconds
- **Tools**: `mev_analyzer`, `flashloan_detector`, `protection_strategy`, `execution_timing`

### 9. Governance Analysis (`governance-analysis`)
**Purpose**: DAO governance proposal analysis and voting strategy
- **Chains**: Ethereum, Polygon
- **Protocols**: Snapshot, Compound Governance, Aave Governance
- **Risk Level**: Medium
- **Duration**: ~60 seconds
- **Tools**: `governance_scanner`, `proposal_analyzer`, `voting_power`, `impact_assessment`

### 10. Protocol Integration (`protocol-integration`)
**Purpose**: Automated DeFi protocol integration and testing
- **Chains**: Polygon, Base
- **Protocols**: Custom
- **Risk Level**: Critical
- **Duration**: ~5 minutes
- **Tools**: `protocol_analyzer`, `integration_generator`, `test_runner`, `deployment_manager`

## Execution Patterns

### Sequential Execution
Tools are executed one after another, with each tool's output feeding into the next.

### Parallel Execution
Multiple tools run simultaneously for faster execution.

### Conditional Execution
Tools are executed based on conditions and previous results.

### Iterative Execution
Tools run repeatedly until convergence criteria are met.

## Usage

### List Available Toolchains
```bash
/web3-toolchain list
```

### Execute a Toolchain
```bash
/web3-toolchain run <toolchain-name> [--chain <chain>] [--dry-run]
```

Examples:
```bash
/web3-toolchain run defi-analysis --chain polygon
/web3-toolchain run yield-optimizer --dry-run
/web3-toolchain run polymarket-strategy
```

### Check Active Executions
```bash
/web3-toolchain status
```

### Cancel Running Execution
```bash
/web3-toolchain cancel <execution-id>
```

### DeFi Shortcuts
```bash
/defi-toolchain analyze    # Runs defi-analysis
/defi-toolchain yield     # Runs yield-optimizer
/defi-toolchain portfolio  # Runs portfolio-management
/defi-toolchain bridge     # Runs bridge-analysis
/defi-toolchain mev        # Runs mev-protection
/defi-toolchain governance # Runs governance-analysis
```

## Environment Variables

### Required
- `GOAT_EVM_PRIVATE_KEY` - Private key for blockchain operations

### Optional
- `POLYGON_RPC_URL` - Polygon network RPC endpoint
- `BASE_RPC_URL` - Base network RPC endpoint
- `CDP_API_KEY_ID` - Coinbase Developer Platform API key ID
- `CDP_API_KEY_SECRET` - Coinbase Developer Platform API key secret
- `MIN_YIELD_THRESHOLD` - Minimum yield threshold for optimization

## Risk Levels

- **Low**: Read-only operations, no financial risk
- **Medium**: Analysis operations with minimal risk
- **High**: Financial operations with significant risk
- **Critical**: High-value operations requiring extreme caution

## Safety Features

- **Dry Run Mode**: Test toolchains without executing transactions
- **Risk Assessment**: Built-in risk evaluation for each operation
- **Gas Monitoring**: Track gas usage and costs
- **Transaction Tracking**: Monitor all blockchain transactions
- **Error Handling**: Comprehensive error reporting and recovery

## Best Practices

1. **Start with Dry Runs**: Always test toolchains with `--dry-run` first
2. **Monitor Gas Prices**: Check network conditions before high-value operations
3. **Use Testnets**: Test on testnets before mainnet operations
4. **Review Results**: Always review toolchain outputs before proceeding
5. **Set Limits**: Use appropriate risk levels for your use case
6. **Backup Wallets**: Ensure wallet backups before critical operations

## Integration with GOAT SDK

Web3 toolchains are fully integrated with the GOAT SDK, providing:
- Polymarket prediction market access
- ERC20 token operations
- Multi-chain support (Polygon, Base, Ethereum)
- Natural language DeFi operations
- Automated risk assessment

## Examples

### Analyze DeFi Protocols
```bash
/web3-toolchain run defi-analysis --chain polygon
```

### Optimize Yield Farming
```bash
/web3-toolchain run yield-optimizer --dry-run
```

### Check Polymarket Opportunities
```bash
/web3-toolchain run polymarket-strategy
```

### Audit Smart Contracts
```bash
/web3-toolchain run contract-audit
```

### Analyze NFT Collections
```bash
/web3-toolchain run nft-analysis
```

## Troubleshooting

### Common Issues
1. **Missing Environment Variables**: Ensure all required env vars are set
2. **Network Issues**: Check RPC endpoints and network connectivity
3. **Insufficient Funds**: Ensure wallet has enough tokens for operations
4. **Gas Estimation**: Some operations may fail due to gas estimation issues

### Debug Commands
```bash
/goat status          # Check GOAT SDK status
/goat wallet          # Verify wallet configuration
/web3-toolchain status # Check active executions
```

## Security Considerations

- **Private Keys**: Never share or commit private keys
- **Network Security**: Use secure RPC endpoints
- **Transaction Verification**: Always verify transaction details
- **Risk Assessment**: Understand the risks before executing
- **Backup Strategy**: Maintain secure wallet backups

## Future Enhancements

- Additional blockchain networks
- More DeFi protocols
- Advanced MEV strategies
- Cross-chain arbitrage
- Automated portfolio rebalancing
- Integration with more prediction markets
