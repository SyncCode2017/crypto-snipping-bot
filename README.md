## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

-   **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
-   **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
-   **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
-   **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```

### Encrypting a private key

Encrypt the Private Key:
1. run
```bash
cast wallet import devKey -i
```
This command will prompt you to set a password. It then encrypts the private key using this password and outputs an encrypted string.

Run this command to see all the stored private keys
```bash
cast wallet list
```

2. To use the private key:
run
```makefile
forge script script/DeployFundMe.s.sol:DeployFundMe --rpc-url http://localhost:8545 --account defaultKey --sender <address-associated-with-the-defaultKey> --broadcast -vvv
```
3. You can also run
```
cd
cd .foundry/keystores/
ls
cat defaultKey
```
