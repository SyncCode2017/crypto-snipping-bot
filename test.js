
const blockchain = require('./blockchain.json');
const { JsonRpcProvider, WebSocketProvider, Wallet, ContractFactory, Contract, parseEther } = require('ethers');
require('dotenv').config();

const provider = new JsonRpcProvider(process.env.LOCAL_RPC_URL_HTTP);
const wallet = Wallet.fromPhrase(process.env.MNEMONIC, provider);
const wallet2 = new Wallet(process.env.PRIVATE_KEY, provider);
console.log(`Wallet address: ${wallet2.address}`);
const erc20Deployer = new ContractFactory(blockchain.erc20Abi, blockchain.erc20Bytecode, wallet2);
console.log('Deploying ..... ');
const uniswapFactory = new Contract(blockchain.factoryAddress, blockchain.factoryAbi, provider);

const main = async () => {
    console.log("Deploying test token ...")
    const token = await erc20Deployer.deploy("SnipingToken", "SNP", parseEther("1000000"));
    await token.waitForDeployment();

    console.log(`Sniping Token deployed at ${token.address}`);

    const tx = await uniswapFactory.createPair(blockchain.WETHAddress, token.address);
    const receipt = await tx.wait();
    console.log("Test liquidity deployed")

}

main()