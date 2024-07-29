include .env

anvil:; anvil --fork-url ${MAINNET_RPC_URL_HTTP}
bot :; node bot.js
test :; node test.js