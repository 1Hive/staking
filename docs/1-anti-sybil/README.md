# Anti-sybil

Staking uses a [Checkpointing library](../../contracts/lib/Checkpointing.sol) to store a queriable history of balances at any past block height. This is important for applications such as token-weighted voting, as one token could potentially be used to vote more than once if it’s transferred to another account after being used to cast a vote. Mimicing the mechanism used by [MiniMe token](https://github.com/Giveth/minime), checkpointing allows to have a snapshot of staked balances at any point in time, that can be used to tally votes.

Whenever there's a balance change in Staking, the Checkpointing library is used to store the block number and staked amount in an array for the staker. Balance changes are stored in natural time order, meaning that it’s not possible to modify a balance nor add a checkpoint in the past.

One important technical detail to note is that in order to save gas (Checkpointing is an expensive operation), block height and value are stored together in one 32 byte slot, so the maximum amount that can be stored is `2^192 - 1`, which may break compatibility with common ERC-20 tokens and be problematic in some edge-cases.

There is also a history array for the total amount staked in the contract at any block height.

