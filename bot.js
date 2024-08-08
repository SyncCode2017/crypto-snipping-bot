
const blockchain = require('./blockchain-base.json')
const { JsonRpcProvider, WebSocketProvider, Wallet, Contract, parseEther } = require('ethers')
require('dotenv').config()
const fs = require('fs')

const provider = new JsonRpcProvider(process.env.LOCAL_RPC_URL_HTTP)
const wallet = Wallet.fromPhrase(process.env.MNEMONIC, provider)

// For mainnet deployment
// const stringToHex = require("./convert_string_to_hex.js")
// const encryptionDecryption = require("./encrypt_decrypt.js")
// const provider = new JsonRpcProvider(process.env.BASE_MAINNET_RPC_URL_HTTP)
// const wallet = async () => {
//     // For encrypted private key
//     const key = await stringToHex(process.env.password, 16)
//     const privateKey = await encryptionDecryption.decrypt(process.env.ENCRYPTED_TRADING_PRIVATE_KEY, key, process.env.TRADING_PRIVATE_KEY_IV)
//     const account = new Wallet(privateKey, provider)
//     return account
// }

const SNIPE_LIST_FILE = "snipeList.csv"
const TOKEN_LIST_FILE = "tokenList.csv"
const constant = parseEther((10 ** 20).toString())
const SLIPPAGE = 0.1 // 10%
const WETH_AMOUNT = parseEther("0.032")
const PRECISION = 10 ** 18
const amountToBuy = 0.003
const MAX_HOLDING_TIME = 60 * 60 * 23.5 // 23.5 hours

const init = () => {
    const uniswapFactory = new Contract(blockchain.factoryAddress, blockchain.factoryAbi, provider)

    // setup an event listener to detect new pairs
    uniswapFactory.on('PairCreated', async (token0, token1, pairAddress) => {
        console.log(`
            New pair detected
            ==================
            pairAddress: ${pairAddress}
            token0: ${token0}
            token1: ${token1}
        `)
        // save this info in a file
        if (token0 == blockchain.WETHAddress && token1 == blockchain.WETHAddress) return
        const t0 = token0 === blockchain.WETHAddress ? token0 : token1
        const t1 = token0 === blockchain.WETHAddress ? token1 : token0
        fs.appendFileSync(SNIPE_LIST_FILE, `${pairAddress},${t0},${t1}\n`)
        // you can use send grid to send an email to yourself for notification
    })
}

const snipe = async () => {
    console.log("Snipe loop")
    const router = new Contract(blockchain.routerAddress, blockchain.routerAbi, wallet)
    const wethContract = new Contract(blockchain.WETHAddress, blockchain.wethAbi, wallet)

    let snipeList = fs.readFileSync(SNIPE_LIST_FILE)
    snipeList = snipeList.toString().split("\n").filter(snipe => snipe !== "")
    if (snipeList.length === 0) return
    for (const snipe of snipeList) {
        const [pairAddress, wethAddress, tokenAddress] = snipe.split(",")
        console.log(`Trying to snipe ${tokenAddress} on ${pairAddress}`)

        const pair = new Contract(pairAddress, blockchain.pairAbi, wallet)
        const totalSupply = await pair.totalSupply()

        if (totalSupply === 0n) {
            console.log(`Pair ${pairAddress} has no liquidity, snipping skipped`)
            continue // go to next iteration or snipe
        }
        // if there is liquidity for the pair, try to snipe
        const tokenIn = wethAddress
        const tokenOut = tokenAddress
        const tokenOutContract = new Contract(tokenOut, blockchain.erc20Abi, wallet)


        const amountIn = parseEther(amountToBuy.toString())
        const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut])

        const amountOutMin = Math.floor(Number(amounts[1]) - Number(amounts[1]) * SLIPPAGE)
        const deadline = Math.floor(Date.now() / 1000) + 60 * 10 // 10 minutes from now

        console.log(`
            Buying new token
            ==================
            pairAddress: ${pairAddress}
            tokenIn: ${Number(amountIn) / PRECISION} ${tokenIn} (WETH)
            tokenOut: ${Number(amounts[1]) / PRECISION} ${tokenOut}
        `)
        const tokenOutBalanceBefore = Number(await tokenOutContract.balanceOf((wallet).address))
        console.log(`tokenOutBalanceBefore: ${tokenOutBalanceBefore / PRECISION}`)
        if (tokenOutBalanceBefore > 0) {
            console.log(`Token ${tokenOut} already owned. Skipping...`)
            continue
        }
        // check if we have enough weth
        const currentWethBalance = await wethContract.balanceOf((wallet).address)
        if (currentWethBalance < parseEther(amountToBuy.toString())) {
            continue
        }

        try {
            // approving weth for trading
            const wethApproveTx = await wethContract.approve(blockchain.routerAddress, constant)
            await wethApproveTx.wait()
            console.log(`weth and tokens approved for Router Contract`)
            const tx = await router.swapExactTokensForTokens(amountIn, BigInt(amountOutMin), [tokenIn, tokenOut], (wallet).address, deadline)
            const receipt = await tx.wait()
            const tokenOutBalanceAfter = Number(await tokenOutContract.balanceOf(await (wallet).address))
            console.log(`tokenOutBalanceAfter: ${tokenOutBalanceAfter / PRECISION}`)
            const tokenOutPrice = Number(amountIn) / (tokenOutBalanceAfter - tokenOutBalanceBefore)
            if (receipt.status === 1) {
                // add it to the token list
                const balanceFactor = "1"
                const entryTimeInSeconds = Math.floor(Date.now() / 1000)
                fs.appendFileSync(TOKEN_LIST_FILE, `${receipt.blockNumber},${wethAddress},${tokenAddress},${tokenOutPrice.toString()},${tokenOutBalanceAfter.toString()},${balanceFactor},${entryTimeInSeconds}\n`)
                // delete the row in the token list
                fs.writeFileSync(SNIPE_LIST_FILE, snipeList.filter(snipe => snipe !== snipe).join("\n"))
            }
        } catch (error) {
            console.log(error)
            continue
        }
    }
}

const managePosition = async () => {
    console.log("Let's check the prices and manage position ...")
    const router = new Contract(blockchain.routerAddress, blockchain.routerAbi, wallet)
    const uniswapFactory = new Contract(blockchain.factoryAddress, blockchain.factoryAbi, provider)
    const wethContract = new Contract(blockchain.WETHAddress, blockchain.wethAbi, wallet)
    const tPFactors = [0.7, 2, 5, 10, 49.5, 99.5] // take profit points
    const sellFactor = 0.5 // fraction of current balance to sell at each take profit point
    const balanceFactors = [1, 0.8, 0.6, 0.4, 0.2]
    let tokenList = fs.readFileSync(TOKEN_LIST_FILE)
    tokenList = tokenList.toString().split("\n").filter(snipedToken => snipedToken !== "")
    if (tokenList.length === 0) return

    for (const snipedToken of tokenList) {
        const [blockNumber, wethAddress, tokenAddress, tokenPriceString, initialTokenBalanceString, balanceFactorString, entryTimeInSeconds] = snipedToken.split(",")
        const tokenPrice = Number(tokenPriceString)
        const initialTokenBalance = Number(initialTokenBalanceString)
        const balanceFactor = Number(balanceFactorString)
        const tokenIn = tokenAddress
        const tokenOut = wethAddress
        const tokenInContract = new Contract(tokenIn, blockchain.erc20Abi, wallet)
        const tokenInBalanceBefore = await tokenInContract.balanceOf((wallet).address)
        console.log(`tokenInBalanceBefore: ${Number(tokenInBalanceBefore) / PRECISION}`)

        //for monitoring
        if (Number(tokenInBalanceBefore) === 0) {
            console.log(`Balance of ${tokenIn} is ${tokenInBalanceBefore.toString()}. Skipping...`)
            // delete the row in the token list
            fs.writeFileSync(TOKEN_LIST_FILE, tokenList.filter(snipedToken => snipedToken !== snipedToken).join("\n"))
            continue // go to next iteration or snipe
        }
        // For already bought tokens
        // Getting current price of the new token
        const pairAddress = await uniswapFactory.getPair(tokenIn, tokenOut)
        const pairContract = new Contract(pairAddress, blockchain.pairAbi, wallet)
        const reserves = await pairContract.getReserves()

        const currentPrice = Number(reserves[0]) / Number(reserves[1])
        //for monitoring
        let amountIn = tokenInBalanceBefore //BigInt(10 ** 18)
        let amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut])
        let amountOutMin = BigInt(Math.floor(Number(amounts[1]) - (Number(amounts[1]) * SLIPPAGE)))

        // checking the current price
        const tokenInPrice = Number(amounts[1]) / Number(amounts[0])
        console.log(`
                    Check point for ${tokenIn} (WETH/token)
                    =================================
                    current price from reserves: ${currentPrice.toFixed(12)}
                    current price: ${tokenInPrice.toFixed(12)} 
                    entry price: ${tokenPrice.toFixed(12)}
                    `)

        if (tokenInPrice <= (tPFactors[0] * tokenPrice) || tokenInPrice >= (tPFactors[tPFactors.length - 1] * tokenPrice) || Math.floor(Date.now() / 1000) >= entryTimeInSeconds + MAX_HOLDING_TIME) {
            console.log('Getting out of this position completely')
            amountIn = tokenInBalanceBefore
            amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut])
            amountOutMin = BigInt(Math.floor(Number(amounts[1]) - Number(amounts[1]) * SLIPPAGE))
            try {
                const [actualTokenPrice, receipt] = await swapTokens(amountIn, amountOutMin, tokenIn, tokenOut, tokenInContract, wethContract)

                if (receipt.status === 1) {
                    // delete the row in the token list
                    fs.writeFileSync(TOKEN_LIST_FILE, tokenList.filter(snipedToken => snipedToken !== snipedToken).join("\n"))
                }
            } catch (error) {
                console.log(error)
                continue
            }
        }
        for (let i = 1; i < tPFactors.length - 2; i++) {
            if (tokenInPrice >= (tPFactors[i] * tokenPrice) && tokenInPrice < (tPFactors[i + 1] * tokenPrice) && balanceFactor == balanceFactors[i - 1] && Math.floor(Date.now() / 1000) < entryTimeInSeconds + MAX_HOLDING_TIME) {
                console.log(`Selling at ${tPFactors[1]}X`)
                const newAmountIn = BigInt(Math.floor(Number(tokenInBalanceBefore) * sellFactor))
                const newAmounts = await router.getAmountsOut(newAmountIn, [tokenIn, tokenOut])
                const newAmountOutMin = BigInt(Math.floor(Number(newAmounts[1]) - (Number(newAmounts[1]) * SLIPPAGE)))
                try {
                    const [actualTokenPrice, receipt] = await swapTokens(newAmountIn, newAmountOutMin, tokenIn, tokenOut, tokenInContract, wethContract)
                    console.log(`tokenInPrice: ${actualTokenPrice / PRECISION}`)
                    if (receipt.status === 1) {
                        const newBalanceFactor = "0.8"
                        // delete the row in the token list
                        fs.writeFileSync(TOKEN_LIST_FILE, tokenList.filter(snipedToken => snipedToken !== snipedToken).join("\n"))
                        fs.appendFileSync(TOKEN_LIST_FILE, `${receipt.blockNumber},${wethAddress},${tokenAddress},${tokenPrice.toString()},${initialTokenBalanceString},${newBalanceFactor},${entryTimeInSeconds}\n`)
                    }
                } catch (error) {
                    console.log(error)
                    continue
                }
            }
            continue
        }
    }
}
const swapTokens = async (amountIn, amountOutMin, tokenIn, tokenOut, tokenInContract, tokenOutContract) => {
    const router = new Contract(blockchain.routerAddress, blockchain.routerAbi, wallet)
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10 // 10 minutes from now
    // try {
    const tokenOutBalanceBefore = Number(await tokenOutContract.balanceOf((wallet).address))
    console.log(`
                    Selling recently bought token
                    ==================================
                    tokenIn: ${Number(amountIn) / PRECISION} ${tokenIn} 
                    tokenOut: ${Number(amountOutMin) / PRECISION} ${tokenOut} (WETH)
                `)
    const tokenApproveTx = await tokenInContract.approve(blockchain.routerAddress, constant)
    await tokenApproveTx.wait()
    const tx = await router.swapExactTokensForTokens(amountIn, amountOutMin, [tokenIn, tokenOut], (wallet).address, deadline)
    const receipt = await tx.wait()
    const tokenOutBalanceAfter = Number(await tokenOutContract.balanceOf((wallet).address))
    const actualTokenPrice = (tokenOutBalanceAfter - tokenOutBalanceBefore) / Number(amountIn)
    console.log(`Sold at ${actualTokenPrice}`)
    return [actualTokenPrice, receipt]
}
const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))
const main = async () => {
    const wethContract = new Contract(blockchain.WETHAddress, blockchain.wethAbi, wallet)
    console.log("Trading bot starting...")
    // console.log(`wallet: ${(wallet).address}`)
    const wethBalance = Number(await wethContract.balanceOf((wallet).address)) / PRECISION
    if (wethBalance < amountToBuy) {
        try {
            //getting weth tokens
            const txGetWeth = await wethContract.deposit({ value: WETH_AMOUNT })
            await txGetWeth.wait()
            console.log(`Got  ${(await wethContract.balanceOf((wallet).address)).toString()} WETH tokens`)
        } catch (error) {
            console.log(error)
            process.exit(1)
        }
    }
    init()
    while (true) {
        console.log("Heartbeat")
        await snipe()
        await managePosition()
        await timeout(3_000) // 3 seconds
    }
}

main()
