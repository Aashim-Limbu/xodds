/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/txline_mock.json`.
 */
export type TxlineMock = {
  "address": "7yYhmy4x1HLW9yDUKFAewbbcigZ9DtSoMFBA6xswAA2J",
  "metadata": {
    "name": "txlineMock",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Mock TxLINE scores publisher — stands in for TxLINE's daily_scores_roots on devnet"
  },
  "instructions": [
    {
      "name": "publishRoot",
      "docs": [
        "Publish (or overwrite) the 32-byte score root for a Fixture into a program-owned",
        "PDA. finalwhistle reads the root from bytes [8..40] of this account (skipping the",
        "8-byte Anchor discriminator) and honours it only because this program owns it."
      ],
      "discriminator": [
        50,
        189,
        35,
        212,
        180,
        100,
        87,
        25
      ],
      "accounts": [
        {
          "name": "scoresRoot",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "fixtureId"
              }
            ]
          }
        },
        {
          "name": "publisher",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "fixtureId",
          "type": "u64"
        },
        {
          "name": "root",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "scoresRoot",
      "discriminator": [
        197,
        129,
        141,
        155,
        255,
        221,
        169,
        73
      ]
    }
  ],
  "types": [
    {
      "name": "scoresRoot",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "root",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    }
  ]
};
