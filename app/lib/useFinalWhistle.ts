"use client";

import { type Wallet } from "@coral-xyz/anchor";
import { usePrivy } from "@privy-io/react-auth";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { useMemo, useRef } from "react";
import { FinalWhistleClient } from "./anchorClient";
import { RPC_URL } from "./config";

type AnyTx = Transaction | VersionedTransaction;

/**
 * Bridge Privy's embedded Solana wallet to an Anchor-compatible wallet and expose a
 * ready-to-use FinalWhistleClient. Returns `client: null` until the User is signed in
 * and their embedded wallet exists.
 */
export function useFinalWhistle() {
  const { ready, authenticated, login, logout, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const wallet = wallets[0];

  // Privy hands back a fresh `signTransaction` identity every render. Memoising the client
  // on it rebuilt the client each render, which retriggered every effect keyed on `client`
  // (PoolList's fetch, notably) — a render loop. The ref keeps the callback current without
  // making it a dependency.
  const signRef = useRef(signTransaction);
  signRef.current = signTransaction;
  // Same reasoning for the wallet object: memoise on the address (a stable string), not
  // on whatever object identity useWallets() returns this render.
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const address = wallet?.address ?? null;

  const connection = useMemo(() => new Connection(RPC_URL, "confirmed"), []);

  const client = useMemo(() => {
    if (!address) return null;

    // Privy v3 signs raw wire bytes, while Anchor speaks web3.js Transaction objects.
    // Both agree on the serialized format, so we round-trip through it: serialize
    // unsigned (Anchor hasn't collected signatures yet), sign, rehydrate.
    const signOne = async <T extends AnyTx>(tx: T): Promise<T> => {
      const isVersioned = tx instanceof VersionedTransaction;
      const bytes = isVersioned
        ? tx.serialize()
        : (tx as Transaction).serialize({ requireAllSignatures: false, verifySignatures: false });
      const { signedTransaction } = await signRef.current({
        transaction: new Uint8Array(bytes),
        wallet: walletRef.current,
      });
      return (
        isVersioned
          ? VersionedTransaction.deserialize(signedTransaction)
          : Transaction.from(signedTransaction)
      ) as T;
    };

    const anchorWallet: Wallet = {
      publicKey: new PublicKey(address),
      signTransaction: signOne,
      // Sequential, not Promise.all: each call can raise its own Privy prompt, and
      // firing them concurrently races those prompts against each other.
      signAllTransactions: async <T extends AnyTx>(txs: T[]): Promise<T[]> => {
        const out: T[] = [];
        for (const tx of txs) out.push(await signOne(tx));
        return out;
      },
      // Browser wallets have no local Keypair; Anchor only uses publicKey + signers.
      payer: undefined as never,
    };
    return new FinalWhistleClient(connection, anchorWallet);
  }, [address, connection]);

  return {
    ready,
    authenticated,
    login,
    logout,
    address: wallet?.address ?? null,
    // Email lives in a different field per login method (email-code vs Google OAuth).
    email: user?.email?.address ?? user?.google?.email ?? null,
    client,
    /** Privy access token for the server-verified API routes (null when signed out). */
    getAccessToken,
  };
}
