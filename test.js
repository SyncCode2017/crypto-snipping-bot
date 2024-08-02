
const blockchain = require('./blockchain-base.json');
const { JsonRpcProvider, WebSocketProvider, Wallet, ContractFactory, Contract, parseEther } = require('ethers');
require('dotenv').config();

const provider = new JsonRpcProvider(process.env.LOCAL_RPC_URL_HTTP);
const wallet2 = new Wallet(process.env.DEFAULT_ANVIL_KEY, provider);
const erc20Deployer = new ContractFactory(blockchain.erc20Abi, blockchain.erc20Bytecode, wallet2);
const uniswapFactory = new Contract(blockchain.factoryAddress, blockchain.factoryAbi, wallet2);
const router = new Contract(blockchain.routerAddress, blockchain.routerAbi, wallet2);
const wethContract = new Contract(blockchain.WETHAddress, blockchain.wethAbi, wallet2);
const amountToBuy = parseEther('10');
const amountOutMin = 0n;
const deadline = Math.floor(Date.now() / 1000) + 60 * 10 // 10 minutes from now

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))

const supplyLiquidity = async (tokenA, tokenB, amount, tokenliquidityfactor) => {
    const tokenAmount = tokenliquidityfactor * amount
    const addLiquidityTx = await router.addLiquidity(
        tokenA,
        tokenB,
        parseEther(amount.toString()),
        parseEther(tokenAmount.toString()),
        0,
        0,
        wallet2.address,
        deadline
    );
    await addLiquidityTx.wait();
    console.log(`Liquidity added to pair at ratio 1 : ${tokenliquidityfactor}`);
}

const main = async () => {
    const tokenTotalSupply = 1_000_000_000
    const WETH_AMOUNT = 8_000
    const amountDesired = 100
    const tokenliquidityfactor = 100000
    // getting weth tokens
    const txGetWeth = await wethContract.deposit({ value: parseEther(WETH_AMOUNT.toString()) });
    await txGetWeth.wait();
    console.log(`Got  ${Number(await wethContract.balanceOf(wallet2.address)) / 10 ** 18} WETH tokens`);

    console.log("Deploying test token ...")
    const token = await erc20Deployer.deploy("SnipingToken", "SNP", parseEther(tokenTotalSupply.toString())); // 1 million tokens
    await token.waitForDeployment();

    console.log(`Sniping Token deployed at ${token.target}`);

    const tx = await uniswapFactory.createPair(blockchain.WETHAddress, token.target);
    const receipt = await tx.wait();
    const pairAddress = await uniswapFactory.getPair(blockchain.WETHAddress, token.target);
    console.log(`Pair deployed at ${pairAddress}`);
    const pair = new Contract(pairAddress, blockchain.pairAbi, wallet2);
    console.log(`New pair created at ${pairAddress}`);

    // approving tokens for liquidity supply
    const constant = BigInt(10 ** 27);
    const tokenApproveTx = await token.approve(blockchain.routerAddress, constant);
    await tokenApproveTx.wait();
    const wethApproveTx = await wethContract.approve(blockchain.routerAddress, constant);
    await wethApproveTx.wait();
    console.log(`weth and tokens approved for Router Contract`);
    // first liquidity to be added
    await supplyLiquidity(blockchain.WETHAddress, token.target, amountDesired, tokenliquidityfactor);
    console.log('Lets move prices ')
    for (let i = 0; i < 9; i++) {
        await timeout(3_000);
        const tx = await router.swapExactTokensForTokens(amountToBuy, amountOutMin, [blockchain.WETHAddress, token.target,], wallet2.address, deadline);
        await tx.wait();
        console.log(`Bought some tokens: ${i}`);
    }
}
main()