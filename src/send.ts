import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
  SystemProgram,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import fs from 'fs';
import { logger, getWallet, getCoinBalance, getTokenDecimal, fetchWithTimeout } from './config';
import {
  RPC_ENDPOINT,
  PROVIDER_PRIVATE_KEY,
  TOKEN_ADDRESS,
  SEND_SOL_AMOUNT,
  NUMBER_OF_WALLETS,
  COMPUTE_UNIT_PRICE,
  COMPUTE_UNIT_LIMIT,
} from './config';
import { executeAndConfirm } from './cpmm/Raydiumswap';

import bs58 from 'bs58';
import wallets from '../wallets.json';

const connection: Connection = new Connection(RPC_ENDPOINT);
const providerWallet: Keypair = getWallet(PROVIDER_PRIVATE_KEY);
let tokenDecimal: number;

interface WALLET_STATUS {
  wallet: Keypair;
  id: number;
}

let walletArray: WALLET_STATUS[] = [];

const createWalletsAndSendSol = async (connection: Connection) => {
  tokenDecimal = await getTokenDecimal(connection, new PublicKey(TOKEN_ADDRESS));
  const walletBalance = await getCoinBalance(connection, providerWallet.publicKey);

  if (walletBalance / LAMPORTS_PER_SOL < SEND_SOL_AMOUNT * NUMBER_OF_WALLETS) {
    logger.error('Deposite sol into the provider wallet');
    process.exit(1);
  }
  let diffWalletCount = NUMBER_OF_WALLETS - wallets.length;
  if (diffWalletCount > 0) {
    let newWallets = [...wallets];
    for (diffWalletCount; diffWalletCount > 0; diffWalletCount--) {
      // Generating a new random Solana keypair
      const keypair = Keypair.generate();

      newWallets.push({
        publicKey: keypair.publicKey.toBase58(),
        secretKey: bs58.encode(keypair.secretKey),
      });
    }
    fs.writeFileSync('../wallets.json', JSON.stringify(newWallets, null, 1));
  }
  for (let i = 0; i < NUMBER_OF_WALLETS; i++) {
    const keypair: Keypair = getWallet(wallets[i].secretKey);
    walletArray = [...walletArray, { wallet: keypair, id: i }];
  }
  logger.info('Wallet Checking Now...');
  for (let i = 0; i < NUMBER_OF_WALLETS; i++) {
    logger.info(`${i + 1}. Checking ${walletArray[i].wallet.publicKey.toBase58()}`);
    let walletBalance = await getCoinBalance(connection, walletArray[i].wallet.publicKey);
    if (walletBalance < SEND_SOL_AMOUNT * LAMPORTS_PER_SOL) {
      let diffBalance = SEND_SOL_AMOUNT * LAMPORTS_PER_SOL - walletBalance;
      const latestBlockhash = await connection.getLatestBlockhash();
      const instructions = [
        SystemProgram.transfer({
          fromPubkey: providerWallet.publicKey,
          toPubkey: walletArray[i].wallet.publicKey,
          lamports: diffBalance,
        }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
      ];
      const messageV0 = new TransactionMessage({
        payerKey: providerWallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions,
      }).compileToV0Message();
      const transaction = new VersionedTransaction(messageV0);
      transaction.sign([providerWallet]);
      let result;
      
      try {
        result = await executeAndConfirm(connection, transaction, latestBlockhash);
        if (result.confirmed) {
          logger.info(`transaction Sent: https://solscan.io/tx/${result.signature}`);
        } else {
          logger.error('Transaction sending is failed, retrying now');
          i--;
          continue;
        }
      } catch (error) {
        logger.error('Transaction sending is failed, retrying now');
        i--;
        continue;
      }
    }
    logger.info('This wallet has enough sol balance');
  }
};
createWalletsAndSendSol(connection);
