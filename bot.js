
const blockchain = require('./blockchain.json');
const { JsonRpcProvider, WebSocketProvider, Contract, Wallet, parseEther } = require('ethers');
require('dotenv').config();

const fs = require('fs');
const provider = new JsonRpcProvider(process.env.LOCAL_RPC_URL_HTTP);

const uniswapFactory = new Contract(blockchain.factoryAddress, blockchain.factoryAbi, provider);
const wallet = Wallet.fromPhrase(process.env.MNEMONIC, provider);

const factory = new Contract(blockchain.factoryAddress, blockchain.factoryAbi, provider);
const router = new Contract(blockchain.routerAddress, blockchain.routerAbi, wallet);
const wethContract = new Contract(blockchain.WETHAddress, blockchain.wethAbi, wallet);

const SNIPE_LIST_FILE = "snipeList.csv";
const TOKEN_LIST_FILE = "tokenList.csv";

const init = () => {

    // setup an event listener to detect new pairs
    uniswapFactory.on('PairCreated', async (token0, token1, pairAddress) => {
        console.log(`
            New pair detected
            ==================
            pairAddress: ${pairAddress}
            token0: ${token0}
            token1: ${token1}
        `);
        // save this info in a file

        if (token0 == blockchain.WETHAddress && token1 == blockchain.WETHAddress) return;
        const t0 = token0 === blockchain.WETHAddress ? token0 : token1;
        const t1 = token0 === blockchain.WETHAddress ? token1 : token0;
        fs.appendFileSync(SNIPE_LIST_FILE, `${pairAddress},${t0},${t1}\n`);
        // you can use send grid to send an email to yourself for notification
    });
}

const snipe = async () => {
    console.log("Snipe loop")

    let snipeList = fs.readFileSync(SNIPE_LIST_FILE)
    snipeList = snipeList.toString().split("\n").filter(snipe => snipe !== "");
    if (snipeList.length === 0) return;
    for (const snipe of snipeList) {
        const [pairAddress, wethAddress, tokenAddress] = snipe.split(",");
        console.log(`Trying to snipe ${tokenAddress} on ${pairAddress}`);

        const pair = new Contract(pairAddress, blockchain.pairAbi, wallet);
        const totalSupply = await pair.totalSupply();

        if (totalSupply === 0n) {
            console.log(`Pair ${pairAddress} is empty, skipping`);
            continue; // go to next iteration or snipe
        }
        // if there is liquidity for the pair, try to snipe
        const tokenIn = wethAddress;
        const tokenOut = tokenAddress;
        const tokenOutContract = new Contract(tokenOut, blockchain.erc20Abi, wallet);

        // we buy 0.1 Eth of new token
        const amountIn = parseEther("0.1");
        const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);

        const amountOutMin = amounts[1] - amounts[1] * 0.05;
        const deadline = Math.floor(Date.now() / 1000) + 60 * 10; // 10 minutes from now

        console.log(`
            Buying new token
            ==================
            pairAddress: ${pairAddress}
            tokenIn: ${amountIn.toString()} ${tokenIn} (WETH)
            tokenOut: ${amountOut.toString()} ${tokenOut}
        `)
        const tokenOutBalanceBefore = await tokenOutContract.balanceOf(wallet.address);
        const tx = await router.swapExactTokensForTokens(amountIn, amountOutMin, [tokenIn, tokenOut], blockchain.recipient, deadline, { value: amounts[0] });
        const receipt = await tx.wait();
        console.log(`Transaction receipt: ${receipt}`);
        const tokenOutBalanceAfter = await tokenOutContract.balanceOf(wallet.address);
        const tokenOutPrice = (tokenOutBalanceAfter - tokenOutBalanceBefore).div(amountIn);
        if (receipt.status === 1) {
            // 1. add it to the token list
            fs.appendFileSync(TOKEN_LIST_FILE, `${receipt.blockNumber},${wethAddress}, ${tokenAddress}, ${tokenOutPrice.toString()}\n`);
            // 2. remove it from the token list
        }

    }
}

const managePosition = async () => {
    // stop loss

    // take profit
}

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))
const main = async () => {
    console.log("Trading bot starting...");
    // getting weth tokens
    const txGetWeth = await wethContract.deposit({ value: parseEther("100") });
    await txGetWeth.wait();
    console.log(`Got  ${(await wethContract.balanceOf(wallet.address)).toString()} WETH tokens`);

    init();

    while (true) {
        console.log("Heartbeat")
        await snipe();
        await managePosition();
        await timeout(3000);
    }
}

main()