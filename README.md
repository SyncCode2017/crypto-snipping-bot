## Snipping Bot

This bot monitors uniswap v2 dex for a new weth-token pair deployment (or launch of a new token) then buys (or snipes) the new token. It allows you to buy your desired tokens at a very low price few seconds after launch. 

Since tokens generally launch at generally low prices, the profit from using this bot can be exponential.
The stop loss and take profit points can be set in the bot.js file.

Please note that you can be rug-pulled if you deploy the bot to the mainnet as most of the new tokens are scam.

### Running the Bot Locally

Clone this repo and run

```shell
$ yarn
```
to install all the dependencies. Create the .env file and include all the necessary parameters as in the .env.example

Open 3 terminals and follow the steps below;

1. In the first terminal, start up the blockchain by running
   
```shell
$ make anvil
```

2. In the second terminal, start the bot by running
   
```shell
$ make bot
```

3. You can run the test in the third terminal with the command below;
   
```shell
$ make test
```


If you want to restart the bot at any point, ensure you delete the contents of snipeList.csv and tokenList.csv files.
Then, follow the steps above.

