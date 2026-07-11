"use client";

import { type Wallet } from "@coral-xyz/anchor";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { Connection, PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { useMemo } from "react";
import { FinalWhistleClient } from "./anchorClient";
import { RPC_URL } from "./config";

type AnyTx = Transaction | VersionedTransaction;

/**
 * Bridge Privy's embedded Solana wallet to an Anchor-compatible wallet and expose a
 * ready-to-use FinalWhistleClient. Returns `client: null` until the User is signed in
 * and their embedded wallet exists.
 */
export function useFinalWhistle() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const wallet = wallets[0];

  const connection = useMemo(() => new Connection(RPC_URL, "confirmed"), []);

  const client = useMemo(() => {
    if (!wallet) return null;
    const anchorWallet: Wallet = {
      publicKey: new PublicKey(wallet.address),
      signTransaction: async <T extends AnyTx>(tx: T): Promise<T> =>
        (await wallet.signTransaction(tx as Transaction)) as T,
      signAllTransactions: async <T extends AnyTx>(txs: T[]): Promise<T[]> =>
        Promise.all(txs.map((tx) => wallet.signTransaction(tx as Transaction))) as Promise<T[]>,
      // Browser wallets have no local Keypair; Anchor only uses publicKey + signers.
      payer: undefined as never,
    };
    return new FinalWhistleClient(connection, anchorWallet);
  }, [wallet, connection]);

  return {
    ready,
    authenticated,
    login,
    logout,
    address: wallet?.address ?? null,
    email: user?.email?.address ?? null,
    client,
  };
}
