import {
  Connection,
  Keypair,
  PublicKey,
  BlockhashWithExpiryBlockHeight,
  VersionedTransaction,
} from '@solana/web3.js';
import BN from 'bn.js';
import {
  initSdk,
  getRandomRunTime,
  getRandomNumber,
  logger,
  getWallet,
  getCoinBalance,
  getTokenDecimal,
  JITO_FEE,
  fetchWithTimeout,
} from './config';
import {
  MIN_BUY_QUANTITY,
  MAX_BUY_QUANTITY,
  MIN_TIME,
  MAX_TIME,
  MIN_TRADE_WAIT,
  MAX_TRADE_WAIT,
  RPC_ENDPOINT,
  PROVIDER_PRIVATE_KEY,
  TOKEN_ADDRESS,
  SLIPPAGE,
  YOUR_WALLET_SECRET_KEY,
  NUMBER_OF_WALLETS,
  TRANSACTION_COUNT_PER_BUNDLE,
  JITO_FEE_PAYER_PRIVATE_KEY,
  BUFFER,
} from './config';

import { getPoolInfo, getAmountOut, makeSwapTransaction, executeAndConfirm } from './cpmm/Raydiumswap';
import { executeAndConfirmByJito } from './jito-bundle';
import { Raydium } from '@raydium-io/raydium-sdk-v2';
import bs58 from 'bs58';
import wallets from '../wallets.json';

let cpmmPoolInfomation: any;
const connection = new Connection(RPC_ENDPOINT, {
  fetch: fetchWithTimeout,
  commitment: 'confirmed',
})
const providerWallet: Keypair = getWallet(PROVIDER_PRIVATE_KEY);
const jitoFeeWallet: Keypair = getWallet(JITO_FEE_PAYER_PRIVATE_KEY);
let tokenDecimal: number;
let transactionCountPerBundle: number = TRANSACTION_COUNT_PER_BUNDLE;

interface WALLET_STATUS {
  wallet: Keypair;
  id: number;
}
let walletArray: WALLET_STATUS[] = [];

let timeout = getRandomRunTime(MIN_TIME, MAX_TIME);
const main = async () => {
  logger.info(`Keep Buying...`);
  logger.info(`We will exit this process after ${timeout} miliseconds...`);
  for (let i = 0; i < NUMBER_OF_WALLETS; i++) {
    const keypair: Keypair = getWallet(wallets[i].secretKey);
    walletArray = [...walletArray, { wallet: keypair, id: i }];
  }
  await buy();
};
setInterval(() => {
  if (timeout === 0) {
    logger.info('process is exited\n\t Times up!');
    process.exit(1);
  }
  timeout--;
}, 1000);
const shuffle = (arr: Array<any>) => {
  return arr.sort(() => {
    return Math.random() - 0.5;
  });
};
const buy = async () => {
  try {
    let bundleTransactions: VersionedTransaction[] = [];
    if (!tokenDecimal) {
      tokenDecimal = await getTokenDecimal(connection, new PublicKey(TOKEN_ADDRESS));
    }
    let walletAmount = walletArray.length;
    if (walletAmount === 0) {
      logger.info('Please send sol to child wallets.');
      process.exit(1);
    }
    walletArray = [...shuffle(walletArray)];

    for (let i = 0; i < transactionCountPerBundle; i++) {
      const signers: Keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(YOUR_WALLET_SECRET_KEY)));
      if (transactionCountPerBundle > walletAmount) {
        transactionCountPerBundle = walletAmount;
        i--;
        continue;
      }

      if (!cpmmPoolInfomation) {
        cpmmPoolInfomation = await getPoolInfo(connection, signers);
      }
      const inputMint = cpmmPoolInfomation.poolInfo.mintA.address;
      const baseIn = inputMint === cpmmPoolInfomation.poolInfo.mintA.address;
      const raydium: Raydium = await initSdk(connection, walletArray[i].wallet);
      let tokenAmount = getRandomNumber(MIN_BUY_QUANTITY, MAX_BUY_QUANTITY);
      const lampAmount: number = await getCoinBalance(connection, walletArray[i].wallet.publicKey);
      let tokenUnitAmount = Number(tokenAmount) * 10 ** tokenDecimal;
      const swapResult = await getAmountOut(new BN(tokenUnitAmount), false, cpmmPoolInfomation.rpcData);
      const solAmount = Number(swapResult.destinationAmountSwapped) * (1 + SLIPPAGE / 100);
      console.log(">>>>>>>>>>>>>>>>>>>",lampAmount, solAmount);
      
      if (new BN(lampAmount).lt(new BN(solAmount + BUFFER * 10 ** 9))) {
        walletArray = [...walletArray.filter((item, index) => index !== i)];
        walletAmount--;
        i--;
        continue;
      } else {
        const swapResult = await getAmountOut(new BN(solAmount), baseIn, cpmmPoolInfomation.rpcData);
        const transaction = await makeSwapTransaction(
          raydium,
          cpmmPoolInfomation.poolInfo,
          cpmmPoolInfomation.poolKeys,
          providerWallet.publicKey,
          baseIn,
          0.1,
          swapResult
        )
        bundleTransactions = [...bundleTransactions, transaction];
      }
    }
    if (transactionCountPerBundle !== TRANSACTION_COUNT_PER_BUNDLE) transactionCountPerBundle++;
    if (bundleTransactions.length) {
      let latestBlockhash: BlockhashWithExpiryBlockHeight = await connection.getLatestBlockhash();
      const result = await executeAndConfirmByJito(
        connection,
        jitoFeeWallet,
        JITO_FEE,
        transactionCountPerBundle,
        bundleTransactions,
        latestBlockhash,
      );
      if (result.confirmed) {
        logger.info(`https://explorer.jito.wtf/bundle/${result.signature}`);
      } else {
        logger.info(`BlockheightError`);
      }
    } else {
      logger.info('Not found available wallets');
    }
    const wtime = getRandomRunTime(MIN_TRADE_WAIT, MAX_TRADE_WAIT);
    logger.info(`waiting ${wtime} miliseconds...`);
    setTimeout(buy, wtime);
  } catch (error: any) {
    console.log(error);
  }
};

main();
