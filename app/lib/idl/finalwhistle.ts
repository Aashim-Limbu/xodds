/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/finalwhistle.json`.
 */
export type Finalwhistle = {
  "address": "3twLVgxWB3fF6EkHGoNzH4ax8sH82fz2KZjgjwg4y7fs",
  "metadata": {
    "name": "finalwhistle",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "FinalWhistle — friend-Group parimutuel Pools settled by TxLINE Score Proof"
  },
  "instructions": [
    {
      "name": "claimPayout",
      "docs": [
        "Claim a winning Entry's parimutuel payout from escrow (ADR-0003):",
        "`entry / winning_outcome_total * pot`, integer math rounded down — leftover dust",
        "stays in escrow. Claim-based so settlement is one bounded transaction regardless",
        "of Entry count; the Entry is closed on claim, so it cannot be claimed twice."
      ],
      "discriminator": [
        127,
        240,
        132,
        62,
        227,
        198,
        146,
        133
      ],
      "accounts": [
        {
          "name": "pool",
          "relations": [
            "entry"
          ]
        },
        {
          "name": "entry",
          "docs": [
            "The caller's Entry on the winning Outcome. Closed on a successful claim (rent to",
            "the User), which also prevents a second claim. Bound to this Pool and this User."
          ],
          "writable": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "userUsdc",
          "writable": true
        },
        {
          "name": "user",
          "writable": true,
          "signer": true,
          "relations": [
            "entry"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimRefund",
      "docs": [
        "Refund an Entry in full from a Void Pool — the caller's whole stake back, no fee",
        "(ADR-0003). Any Outcome's Entry is refundable. The Entry is closed on refund",
        "(rent to the User), so it cannot be refunded twice."
      ],
      "discriminator": [
        15,
        16,
        30,
        161,
        255,
        228,
        97,
        60
      ],
      "accounts": [
        {
          "name": "pool",
          "relations": [
            "entry"
          ]
        },
        {
          "name": "entry",
          "docs": [
            "The caller's Entry (any Outcome). Closed on refund (rent to the User), which also",
            "prevents a second refund. Bound to this Pool and this User."
          ],
          "writable": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "userUsdc",
          "writable": true
        },
        {
          "name": "user",
          "writable": true,
          "signer": true,
          "relations": [
            "entry"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createPool",
      "docs": [
        "Create a Pool on a Fixture from a provable Pool Type, Open and empty, with a",
        "Pool-owned USDC escrow. Every Pool belongs to a Group (ADR-0001) and is created",
        "from a fixed Pool Type (ADR-0002); no price is set here (ADR-0003)."
      ],
      "discriminator": [
        233,
        146,
        209,
        142,
        207,
        104,
        64,
        188
      ],
      "accounts": [
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "group",
          "type": "pubkey"
        },
        {
          "name": "fixtureId",
          "type": "u64"
        },
        {
          "name": "poolType",
          "type": {
            "defined": {
              "name": "poolType"
            }
          }
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "kickoffTs",
          "type": "i64"
        },
        {
          "name": "lineX2",
          "type": "u16"
        }
      ]
    },
    {
      "name": "lock",
      "docs": [
        "Lock the Pool at Fixture kickoff: no more Entries, pot and Outcome totals frozen.",
        "Permissionless (ADR-0004) — any signer may call once `now >= kickoff_ts`; the",
        "Keeper does it for UX but is not required. One-way: only an Open Pool can Lock."
      ],
      "discriminator": [
        21,
        19,
        208,
        43,
        237,
        62,
        255,
        87
      ],
      "accounts": [
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "signer",
          "docs": [
            "Permissionless: any signer may crank the Lock; identity is intentionally",
            "unchecked (not constrained to the creator or a Keeper). Present only so the",
            "transaction has a signer."
          ],
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "placeEntry",
      "docs": [
        "Place an Entry: move `amount` USDC from the caller into escrow and credit it to",
        "the caller's Entry on `outcome`, the Outcome's total, and the pot. Allowed only",
        "while the Pool is Open. Repeat Entries on the same Outcome fold into one record."
      ],
      "discriminator": [
        197,
        61,
        106,
        66,
        124,
        36,
        31,
        192
      ],
      "accounts": [
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "entry",
          "writable": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "userUsdc",
          "writable": true
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settle",
      "docs": [
        "Settle a Locked Pool trustlessly (ADR-0004): verify TxLINE's Merkle inclusion",
        "proof against its published root in-program, then route to the terminal state.",
        "A Fixture that is abandoned, or whose proven winning Outcome has zero Entries,",
        "routes to Void (so the pot is never stranded, ADR-0003); otherwise the Pool is",
        "Settled with the proven stats for the Proof Receipt. Permissionless, once-only;",
        "a proof that does not verify moves nothing."
      ],
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "scoresRoot",
          "docs": [
            "by requiring `owner == TXLINE_PROGRAM_ID` (ADR-0008); we only read the root bytes."
          ]
        },
        {
          "name": "signer",
          "docs": [
            "Permissionless: any signer may settle (ADR-0004); identity is unchecked."
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "proof",
          "type": {
            "defined": {
              "name": "scoreProof"
            }
          }
        }
      ]
    },
    {
      "name": "voidExpired",
      "docs": [
        "Void a Locked Pool that never finalised: once `now >= kickoff + grace window`,",
        "anyone may permissionlessly Void it so its funds can be refunded (CONTEXT.md",
        "grace window; ADR-0003). No Score Proof is needed — this is the fallback for a",
        "Fixture the oracle never reports."
      ],
      "discriminator": [
        179,
        175,
        239,
        30,
        9,
        24,
        238,
        223
      ],
      "accounts": [
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "signer",
          "docs": [
            "Permissionless: any signer may Void an expired Pool (ADR-0003); identity unchecked."
          ],
          "signer": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "entry",
      "discriminator": [
        63,
        18,
        152,
        113,
        215,
        246,
        221,
        250
      ]
    },
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    }
  ],
  "events": [
    {
      "name": "poolSettled",
      "discriminator": [
        71,
        220,
        136,
        147,
        65,
        185,
        90,
        47
      ]
    },
    {
      "name": "poolVoided",
      "discriminator": [
        22,
        87,
        67,
        110,
        164,
        19,
        157,
        9
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "poolNotOpen",
      "msg": "Pool is not Open"
    },
    {
      "code": 6001,
      "name": "poolNotLocked",
      "msg": "Pool is not Locked"
    },
    {
      "code": 6002,
      "name": "poolNotSettled",
      "msg": "Pool is not Settled"
    },
    {
      "code": 6003,
      "name": "poolNotVoid",
      "msg": "Pool is not Void"
    },
    {
      "code": 6004,
      "name": "notWinningOutcome",
      "msg": "Entry is not on the winning Outcome"
    },
    {
      "code": 6005,
      "name": "gracePeriodNotElapsed",
      "msg": "The grace window after kickoff has not elapsed"
    },
    {
      "code": 6006,
      "name": "beforeKickoff",
      "msg": "Fixture kickoff time has not been reached"
    },
    {
      "code": 6007,
      "name": "proofVerificationFailed",
      "msg": "Score Proof did not verify against TxLINE's published root"
    },
    {
      "code": 6008,
      "name": "fixtureNotFinalised",
      "msg": "Fixture is not finalised"
    },
    {
      "code": 6009,
      "name": "invalidLine",
      "msg": "Over/Under Line must be a half-integer (odd when stored as line_x2)"
    },
    {
      "code": 6010,
      "name": "invalidScoresRoot",
      "msg": "Scores root account is invalid or not owned by TxLINE"
    },
    {
      "code": 6011,
      "name": "zeroAmount",
      "msg": "Entry amount must be greater than zero"
    },
    {
      "code": 6012,
      "name": "invalidOutcome",
      "msg": "Outcome index is out of range for this Pool Type"
    },
    {
      "code": 6013,
      "name": "wrongMint",
      "msg": "Token account mint does not match the Pool's USDC mint"
    },
    {
      "code": 6014,
      "name": "wrongOwner",
      "msg": "Token account is not owned by the signer"
    },
    {
      "code": 6015,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "entry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "group",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "fixtureId",
            "type": "u64"
          },
          {
            "name": "poolType",
            "type": {
              "defined": {
                "name": "poolType"
              }
            }
          },
          {
            "name": "lineX2",
            "docs": [
              "The Over/Under Line times two (a half-integer, so always odd) for line-based Pool",
              "Types; 0 for MatchWinner. Storing ×2 keeps it an integer and makes a tie impossible."
            ],
            "type": "u16"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "poolState"
              }
            }
          },
          {
            "name": "kickoffTs",
            "type": "i64"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "escrow",
            "type": "pubkey"
          },
          {
            "name": "pot",
            "type": "u64"
          },
          {
            "name": "outcomeTotals",
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "winningOutcome",
            "docs": [
              "Set at settlement (ADR-0004). `None` until Settled; the proven stats and the",
              "root are only meaningful once `state == Settled`."
            ],
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "proven",
            "type": {
              "defined": {
                "name": "provenStats"
              }
            }
          },
          {
            "name": "scoreRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "voidReason",
            "docs": [
              "Set when the Pool Voids; `None` otherwise. Records why refunds were issued."
            ],
            "type": {
              "option": {
                "defined": {
                  "name": "voidReason"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "poolSettled",
      "docs": [
        "Proof Receipt inputs, emitted at settlement (ADR-0004 hero): the winning Outcome,",
        "the proven team-level stats, the TxLINE root verified against, and the Merkle path."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "fixtureId",
            "type": "u64"
          },
          {
            "name": "winningOutcome",
            "type": "u8"
          },
          {
            "name": "proven",
            "type": {
              "defined": {
                "name": "provenStats"
              }
            }
          },
          {
            "name": "scoreRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "merklePath",
            "type": {
              "vec": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          }
        ]
      }
    },
    {
      "name": "poolState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "locked"
          },
          {
            "name": "settled"
          },
          {
            "name": "void"
          }
        ]
      }
    },
    {
      "name": "poolType",
      "docs": [
        "The provable templates a Pool can be created from (ADR-0002). Only `MatchWinner1x2`",
        "is wired in this ticket; the O/U types are appended in their own tickets — appending",
        "a variant does not change the `Pool` account layout."
      ],
      "repr": {
        "kind": "rust"
      },
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "matchWinner"
          },
          {
            "name": "totalGoals"
          }
        ]
      }
    },
    {
      "name": "poolVoided",
      "docs": [
        "Emitted when a Pool Voids, with the reason — so the app can show why every Entry is",
        "being refunded (parallels the Proof Receipt's transparency)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "fixtureId",
            "type": "u64"
          },
          {
            "name": "reason",
            "type": {
              "defined": {
                "name": "voidReason"
              }
            }
          }
        ]
      }
    },
    {
      "name": "provenStats",
      "docs": [
        "The proven team-level stats stored on a Settled Pool, for the Proof Receipt."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "homeGoals",
            "type": "u8"
          },
          {
            "name": "awayGoals",
            "type": "u8"
          },
          {
            "name": "homeCorners",
            "type": "u8"
          },
          {
            "name": "awayCorners",
            "type": "u8"
          },
          {
            "name": "homeCards",
            "type": "u8"
          },
          {
            "name": "awayCards",
            "type": "u8"
          },
          {
            "name": "status",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "scoreProof",
      "docs": [
        "A TxLINE Score Proof: the finalised team-level stats plus the Merkle inclusion path",
        "(leaf -> root) proving them against TxLINE's published root (ADR-0008)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "homeGoals",
            "type": "u8"
          },
          {
            "name": "awayGoals",
            "type": "u8"
          },
          {
            "name": "homeCorners",
            "type": "u8"
          },
          {
            "name": "awayCorners",
            "type": "u8"
          },
          {
            "name": "homeCards",
            "type": "u8"
          },
          {
            "name": "awayCards",
            "type": "u8"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "merklePath",
            "type": {
              "vec": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          }
        ]
      }
    },
    {
      "name": "voidReason",
      "docs": [
        "Why a Pool Voided (CONTEXT.md Void triggers)."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "abandoned"
          },
          {
            "name": "noWinningEntries"
          },
          {
            "name": "expired"
          }
        ]
      }
    }
  ]
};
