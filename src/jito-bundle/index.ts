import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  SystemProgram,
  VersionedTransaction,
  BlockhashWithExpiryBlockHeight,
  Transaction,
} from '@solana/web3.js';
import axios, { AxiosError, AxiosResponse } from 'axios';

import { logger, sleep } from '../config';
import { confirm } from '../cpmm/Raydiumswap';
import { Currency, CurrencyAmount } from '@raydium-io/raydium-sdk-v2';
import bs58 from 'bs58';

const jitoTipAccounts = [
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
];

export const getRandomValidatorKey = (): PublicKey => {
  const randomValidator = jitoTipAccounts[Math.floor(Math.random() * jitoTipAccounts.length)];
  return new PublicKey(randomValidator);
};

export const executeAndConfirmByJito = async (
  connection: Connection,
  payer: Keypair,
  jitoFee: string,
  bundleTransactionLimit: number,
  transactions: Array<VersionedTransaction>,
  latestBlockhash: BlockhashWithExpiryBlockHeight,
): Promise<{ confirmed: boolean; signature: string }> => {
  
  if (transactions.length > bundleTransactionLimit) {
    console.error('Exceeded bundleTransactionLimit');
    return { confirmed: false, signature: '' };
  }
  logger.info('Starting Kitty transaction execution...');
  const JitoFeeWallet = getRandomValidatorKey();
  
  logger.trace(`Selected Kitty fee wallet: ${JitoFeeWallet.toBase58()}`);
  try {
    const fee = new CurrencyAmount(Currency.SOL, jitoFee, true).raw.toNumber();
    logger.info(`Calculated fee: ${fee} lamports`);
    
    const jitTipTxFeeMessage = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: JitoFeeWallet,
          lamports: fee,
        }),
      ],
    }).compileToV0Message();
    
    const jitoFeeTx = new VersionedTransaction(jitTipTxFeeMessage);
    jitoFeeTx.sign([payer]);
    const jitoTxsignature = bs58.encode(jitoFeeTx.signatures[0]);
    // Serialize the transactions once here
    const serializedjitoFeeTx = bs58.encode(jitoFeeTx.serialize());
    let serializedTransaction: string[] = [];
    transactions.map((transaction) => {
      // transaction.message.recentBlockhash = blockhash;
      serializedTransaction.push(bs58.encode(transaction.serialize()));
    });

    const serializedTransactions = [serializedjitoFeeTx, ...serializedTransaction];
    // const serializedTransactions = [serializedjitoFeeTx];
    // https://jito-labs.gitbook.io/mev/searcher-resources/json-rpc-api-reference/url
    const endpoint = 'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles';
    let flag = false;

    try {
      let result = await axios.post(endpoint, {
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [serializedTransactions],
      });
      if (result) {
        flag = true;
      }
    } catch (error) {
      logger.error((error as AxiosError).code);
    }

    logger.info('Sending transactions to endpoints...');

    if (flag) {
      logger.info(`At least one successful response`);
      logger.info(`Confirming jito transaction...`);

      return await confirm(connection, jitoTxsignature, latestBlockhash);
    } else {
      logger.info(`No successful responses received for jito`);
    }

    return { confirmed: false, signature: jitoTxsignature };
  } catch (error) {
    if (error instanceof AxiosError) {
      logger.info({ error: error.response?.data }, 'Failed to execute jito transaction');
    }
    console.error('Error during transaction execution', error);
    return { confirmed: false, signature: '' };
  }
};
