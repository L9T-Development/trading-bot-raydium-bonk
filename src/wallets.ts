import { Keypair } from '@solana/web3.js';
import fs from 'fs';
import bs58 from 'bs58';
import { NUMBER_OF_WALLETS } from './config';

let newWallets = [];
for (let i = 0; i < NUMBER_OF_WALLETS; i++) {
  // Generating a new random Solana keypair
  const keypair = Keypair.generate();

  newWallets.push({
    publicKey: keypair.publicKey.toBase58(),
    secretKey: bs58.encode(keypair.secretKey),
  });
}
fs.writeFileSync('./wallets.json', JSON.stringify(newWallets));
console.log('Successfully Created!');
console.log("Available wallets:\n", newWallets);
