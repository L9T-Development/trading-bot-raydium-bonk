import {
  TOKEN_ADDRESS,
  GATHER_WALLET_ADDRESS,
  COMPUTE_UNIT_LIMIT,
  COMPUTE_UNIT_PRICE,
  RPC_ENDPOINT,
  getTokenAccount,
} from './config';
import wallets from '../wallets.json';
import { getWallet, getTokenAccountBalance, getCoinBalance } from './config';
import { logger, fetchWithTimeout, IS_TOKEN_2022 } from './config';
import {
  Connection,
  PublicKey,
  ComputeBudgetProgram,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  Keypair,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import { executeAndConfirm } from './cpmm/Raydiumswap';
import {
  unpackMint,
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  Account,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
export const wallet_2_gather_keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(GATHER_WALLET_ADDRESS)));

const connection: Connection = new Connection(RPC_ENDPOINT, {
  fetch: fetchWithTimeout,
  commitment: 'confirmed',
});

interface WALLET_STATUS {
  wallet: Keypair;
  id: number;
  origin: number;
}

let walletArray: WALLET_STATUS[] = [];
const getWalletAndgather = async () => {
  const toTokenAccount = await getTokenAccount(
    connection,
    wallet_2_gather_keypair,
    new PublicKey(TOKEN_ADDRESS),
    IS_TOKEN_2022,
  );
  let numberOfWallets = wallets.length;
  for (let i = 0; i < numberOfWallets; i++) {
    const keypair: Keypair = getWallet(wallets[i].secretKey);
    walletArray = [...walletArray, { wallet: keypair, id: i, origin: i % 2 }];
  }

  const gather = async (origin: number) => {
    let mwalletArray = walletArray.filter((item) => item.origin === origin);
    for (let i = 0; i < mwalletArray.length; i++) {
      try {
        let selWallet: Keypair = mwalletArray[i].wallet;
        try {
          let fromTokenAccount!: Account;
          try {
            fromTokenAccount = await getTokenAccount(
              connection,
              selWallet,
              new PublicKey(TOKEN_ADDRESS),
              IS_TOKEN_2022,
            );
          } catch (error) {
            throw new Error(`${selWallet.publicKey.toBase58()} - Can't find Token Account`);
          }
          let tokenAmount = await getTokenAccountBalance(connection, selWallet.publicKey.toBase58(), TOKEN_ADDRESS);
          if (tokenAmount.amount != 0) {
            const latestBlockhash = await connection.getLatestBlockhash();
            let programId = IS_TOKEN_2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
            const instructions = [
              createTransferInstruction(
                fromTokenAccount.address,
                toTokenAccount.address,
                selWallet.publicKey,
                tokenAmount.amount,
                [],
                programId,
              ),
              ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE }),
              ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
            ];
            const messageV0 = new TransactionMessage({
              payerKey: selWallet.publicKey,
              recentBlockhash: latestBlockhash.blockhash,
              instructions,
            }).compileToV0Message();

            const transaction = new VersionedTransaction(messageV0);
            transaction.sign([selWallet]);
            let result1 = await executeAndConfirm(connection, transaction, latestBlockhash);
            if (result1.confirmed) {
              logger.info(
                `Token Sent! =>',
                ${selWallet.publicKey.toBase58()},
                https://solscan.io/tx/${result1.signature}`,
              );
            }
          }
        } catch (error) {
          logger.info(`Can't find Token Account! - ${selWallet.publicKey.toBase58()}`);
        }

        const walletBalance = await getCoinBalance(connection, selWallet.publicKey);

        if (walletBalance < 1000000) {
          console.log(`This wallet(${selWallet.publicKey.toBase58()}) don't have enough coin balance!!`);
        } else {
          const latestBlockhash = await connection.getLatestBlockhash();
          const instructions = [
            SystemProgram.transfer({
              fromPubkey: selWallet.publicKey,
              toPubkey: wallet_2_gather_keypair.publicKey,
              lamports: walletBalance - 1000000,
            }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE }),
            ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
          ];
          const messageV0 = new TransactionMessage({
            payerKey: selWallet.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions,
          }).compileToV0Message();

          const transaction = new VersionedTransaction(messageV0);
          transaction.sign([selWallet]);
          let result2 = await executeAndConfirm(connection, transaction, latestBlockhash);
          if (result2.confirmed) {
            logger.info(`Sol Sent! =>, ${selWallet.publicKey.toBase58()}, https://solscan.io/tx/${result2.signature}`);
          }
        }
      } catch (e: unknown) {
        logger.info(`[SWAP - SELL - ERROR] ${e}`);
      }
    }
  };
  const callGather = async () => {
    if (numberOfWallets === 1) {
      await gather(0);
    } else {
      gather(0);
      gather(1);
    }
  };
  await callGather();
};

getWalletAndgather();
