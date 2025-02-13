import {
  TOKEN_ADDRESS,
  GATHER_WALLET_ADDRESS,
  COMPUTE_UNIT_LIMIT,
  COMPUTE_UNIT_PRICE,
  RPC_ENDPOINT,
  getTokenAccount,
} from './config';
import wallets from '../wallets.json';
import { getWallet, getTokenAccountBalance, getCoinBalance, fetchWithTimeout } from './config';
import { logger } from './config';
import { Connection, Keypair } from '@solana/web3.js';
import { executeAndConfirm } from './cpmm/Raydiumswap';
import { unpackMint, getOrCreateAssociatedTokenAccount, createTransferInstruction, Account } from '@solana/spl-token';
import bs58 from 'bs58';
import * as fs from 'fs';
const connection: Connection = new Connection(RPC_ENDPOINT, {
  fetch: fetchWithTimeout,
  commitment: 'confirmed',
});
interface WALLET_STATUS {
  secretKey: string;
  publicKey: string;
  tokenBalance: number;
  solBalance: number;
}
function getFormattedDate(): string {
  const now = new Date();

  const year: string = String(now.getFullYear()); // Get last two digits of the year
  const month: string = String(now.getMonth() + 1).padStart(2, '0'); // Get month and pad with zero
  const day: string = String(now.getDate()).padStart(2, '0'); // Get day and pad with zero
  const hours: string = String(now.getHours()).padStart(2, '0'); // Get hours and pad with zero
  const minutes: string = String(now.getMinutes()).padStart(2, '0'); // Get minutes and pad with zero
  const seconds: string = String(now.getSeconds()).padStart(2, '0'); // Get seconds and pad with zero

  // Combine into the specified format
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}
let walletArray: WALLET_STATUS[] = [];
let filename = './WalletScanData/';
async function scan() {
  for (let i = 0; i < wallets.length; i++) {
    try {
      let keypair: Keypair = getWallet(wallets[i].secretKey);
      let token_in_wallet = await getTokenAccountBalance(connection, wallets[i].publicKey, TOKEN_ADDRESS);
      const walletBalance = await getCoinBalance(connection, keypair.publicKey);
      walletArray.push({
        publicKey: keypair.publicKey.toBase58(),
        secretKey: bs58.encode(keypair.secretKey),
        tokenBalance: token_in_wallet.uiAmount,
        solBalance: walletBalance / 10 ** 9,
      });
    } catch (e: unknown) {
      logger.info(`[SWAP - SELL - ERROR] ${e}`);
    }
  }
  filename = filename + getFormattedDate() + '.json';
  fs.writeFileSync(filename, JSON.stringify(walletArray));
  logger.info('Wallet scanning is finished!!');
}
scan();
