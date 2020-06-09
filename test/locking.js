const { assertRevert } = require('@aragon/contract-helpers-test/assertThrow')
const { bn, assertBn, MAX_UINT64 } = require('@aragon/contract-helpers-test/numbers')

const { deploy } = require('./helpers/deploy')(artifacts)
const { DEFAULT_STAKE_AMOUNT, DEFAULT_LOCK_AMOUNT, EMPTY_DATA, ZERO_ADDRESS } = require('./helpers/constants')
const { STAKING_ERRORS } = require('./helpers/errors')

contract('Staking app, Locking', ([owner, user1, user2]) => {
  let staking, token, lockManager

  const approveAndStake = async (amount = DEFAULT_STAKE_AMOUNT, from = owner) => {
    await token.approve(staking.address, amount, { from })
    await staking.stake(amount, EMPTY_DATA, { from })
  }

  const approveStakeAndLock = async (
    manager,
    lockAmount = DEFAULT_LOCK_AMOUNT,
    stakeAmount = DEFAULT_STAKE_AMOUNT,
    from = owner
  ) => {
    await approveAndStake(stakeAmount, from)
    await staking.allowManagerAndLock(lockAmount, manager, lockAmount, EMPTY_DATA, { from })
  }

  beforeEach(async () => {
    const deployment = await deploy(owner)
    token = deployment.token
    staking = deployment.staking
    lockManager = deployment.lockManager
  })

  it('allows new manager and locks amount', async () => {
    await approveStakeAndLock(user1)

    // check lock values
    const { _amount, _allowance } = await staking.getLock(owner, user1)
    assert.equal(_amount, DEFAULT_LOCK_AMOUNT, "locked amount should match")
    assert.equal(_allowance, DEFAULT_LOCK_AMOUNT, "locked allowance should match")

    assert.equal((await staking.unlockedBalanceOf(owner)).valueOf(), DEFAULT_STAKE_AMOUNT - DEFAULT_LOCK_AMOUNT, "Unlocked balance should match")
    const { staked, locked } = await staking.getBalancesOf(owner)
    assert.equal(staked.toString(), DEFAULT_STAKE_AMOUNT, "Staked balance should match")
    assert.equal(locked.toString(), DEFAULT_LOCK_AMOUNT, "Locked balance should match")
  })

  it('fails locking 0 tokens', async () => {
    await approveAndStake()
    await assertRevert(staking.allowManagerAndLock(0, user1, 1, EMPTY_DATA), STAKING_ERRORS.ERROR_AMOUNT_ZERO)
  })

  it('fails locking without enough allowance', async () => {
    await approveAndStake()
    await assertRevert(staking.allowManagerAndLock(2, user1, 1, EMPTY_DATA), STAKING_ERRORS.ERROR_NOT_ENOUGH_ALLOWANCE)
  })

  it('fails locking more tokens than staked', async () => {
    await approveAndStake()
    await assertRevert(staking.allowManagerAndLock(DEFAULT_STAKE_AMOUNT + 1, user1, DEFAULT_STAKE_AMOUNT + 1, EMPTY_DATA), STAKING_ERRORS.ERROR_NOT_ENOUGH_BALANCE)
  })

  it('fails locking if already locked', async () => {
    await approveStakeAndLock(user1)

    await approveAndStake()
    await assertRevert(staking.allowManagerAndLock(DEFAULT_STAKE_AMOUNT, user1, DEFAULT_STAKE_AMOUNT, "0x02"), STAKING_ERRORS.ERROR_LOCK_ALREADY_EXISTS)
  })

  it('creates a new allowance', async () => {
    await staking.allowManager(user1, DEFAULT_LOCK_AMOUNT, EMPTY_DATA)

    const { _allowance  } = await staking.getLock(owner, user1)
    assert.equal(_allowance, DEFAULT_LOCK_AMOUNT, "allowed amount should match")
  })

  it('creates a new allowance and then lock manager locks', async () => {
    await approveAndStake()
    await staking.allowManager(user1, DEFAULT_LOCK_AMOUNT, EMPTY_DATA)
    await staking.lock(owner, user1, DEFAULT_LOCK_AMOUNT, { from: user1 })

    // check lock values
    const { _amount, _allowance } = await staking.getLock(owner, user1)
    assert.equal(_amount, DEFAULT_LOCK_AMOUNT, "locked amount should match")
    assert.equal(_allowance, DEFAULT_LOCK_AMOUNT, "locked allowance should match")

    assert.equal((await staking.unlockedBalanceOf(owner)).valueOf(), DEFAULT_STAKE_AMOUNT - DEFAULT_LOCK_AMOUNT, "Unlocked balance should match")
  })

  it('fails creating allowance of 0 tokens', async () => {
    await assertRevert(staking.allowManager(user1, 0, EMPTY_DATA), STAKING_ERRORS.ERROR_AMOUNT_ZERO)
  })

  it('fails creating allowance if lock exists', async () => {
    await approveStakeAndLock(user1)
    await assertRevert(staking.allowManager(user1, 1, EMPTY_DATA), STAKING_ERRORS.ERROR_LOCK_ALREADY_EXISTS)
  })

  it('increases allowance of existing lock', async () => {
    await approveStakeAndLock(user1)

    await staking.increaseLockAllowance(user1, DEFAULT_LOCK_AMOUNT)

    const { _allowance } = await staking.getLock(owner, user1)
    assert.equal(_allowance, 2 * DEFAULT_LOCK_AMOUNT, "allowed amount should match")
  })

  it('fails increasing allowance of non-existing', async () => {
    await assertRevert(staking.increaseLockAllowance(user1, 1), STAKING_ERRORS.ERROR_LOCK_DOES_NOT_EXIST)
  })

  it('fails increasing allowance of existing lock by 0', async () => {
    await approveStakeAndLock(user1)

    await assertRevert(staking.increaseLockAllowance(user1, 0), STAKING_ERRORS.ERROR_AMOUNT_ZERO)
  })

  it('fails increasing allowance of existing lock if not owner or manager', async () => {
    await approveStakeAndLock(user1)

    await assertRevert(staking.increaseLockAllowance(user1, 1, { from: user2 }), STAKING_ERRORS.ERROR_LOCK_DOES_NOT_EXIST)
  })

  it('decreases allowance of existing lock by the owner', async () => {
    await approveAndStake()
    await staking.allowManagerAndLock(DEFAULT_LOCK_AMOUNT, user1, DEFAULT_LOCK_AMOUNT + 1, EMPTY_DATA)

    await staking.decreaseLockAllowance(owner, user1, 1, { from: owner })

    const { _allowance } = await staking.getLock(owner, user1)
    assert.equal(_allowance, DEFAULT_LOCK_AMOUNT, "allowed amount should match")
  })

  it('decreases allowance of existing lock by manager', async () => {
    await approveAndStake()
    await staking.allowManagerAndLock(DEFAULT_LOCK_AMOUNT, user1, DEFAULT_LOCK_AMOUNT + 1, EMPTY_DATA)

    await staking.decreaseLockAllowance(owner, user1, 1, { from: user1 })

    const { _allowance } = await staking.getLock(owner, user1)
    assert.equal(_allowance, DEFAULT_LOCK_AMOUNT, "allowed amount should match")
  })

  it('fails decreasing allowance of existing lock by 0', async () => {
    await approveStakeAndLock(user1)

    await assertRevert(staking.decreaseLockAllowance(owner, user1, 0), STAKING_ERRORS.ERROR_AMOUNT_ZERO)
  })

  it('fails decreasing allowance of existing lock to 0', async () => {
    await approveStakeAndLock(user1)

    await staking.unlock(owner, user1, DEFAULT_LOCK_AMOUNT, { from: user1 })

    await assertRevert(staking.decreaseLockAllowance(owner, user1, DEFAULT_LOCK_AMOUNT), STAKING_ERRORS.ERROR_ALLOWANCE_ZERO)
  })

  it('fails decreasing allowance to less than lock', async () => {
    await approveAndStake()
    await staking.allowManagerAndLock(DEFAULT_LOCK_AMOUNT, user1, DEFAULT_LOCK_AMOUNT + 1, EMPTY_DATA)

    await assertRevert(staking.decreaseLockAllowance(owner, user1, 2), STAKING_ERRORS.ERROR_NOT_ENOUGH_ALLOWANCE)
  })

  it('fails decreasing allowance by 3rd party', async () => {
    await approveAndStake()
    await staking.allowManagerAndLock(DEFAULT_LOCK_AMOUNT, user1, DEFAULT_LOCK_AMOUNT + 1, EMPTY_DATA)

    await assertRevert(staking.decreaseLockAllowance(owner, user1, 1, { from: user2 }), STAKING_ERRORS.ERROR_CANNOT_CHANGE_ALLOWANCE)
  })

  it('increases amount of existing lock', async () => {
    await approveStakeAndLock(user1)

    await approveAndStake()
    await staking.increaseLockAllowance(user1, DEFAULT_LOCK_AMOUNT)
    await staking.lock(owner, user1, DEFAULT_LOCK_AMOUNT)

    const { _amount } = await staking.getLock(owner, user1)
    assert.equal(_amount, 2 * DEFAULT_LOCK_AMOUNT, "locked amount should match")
  })

  it('fails increasing lock with 0 tokens', async () => {
    await approveStakeAndLock(user1)

    await approveAndStake()
    await assertRevert(staking.lock(owner, user1, 0), STAKING_ERRORS.ERROR_AMOUNT_ZERO)
  })

  it('fails increasing lock with more tokens than staked', async () => {
    await approveStakeAndLock(user1)

    await approveAndStake()
    await assertRevert(staking.lock(owner, user1, 2 * DEFAULT_STAKE_AMOUNT + 1), STAKING_ERRORS.ERROR_NOT_ENOUGH_BALANCE)
  })

  it('fails increasing lock if not owner or manager', async () => {
    await approveStakeAndLock(user1)

    await approveAndStake()
    await assertRevert(staking.lock(owner, user1, 1, { from: user2 }), STAKING_ERRORS.ERROR_NOT_ALLOWED)
  })

  it('unlocks with only 1 lock, EOA manager', async () => {
    await approveStakeAndLock(user1, DEFAULT_LOCK_AMOUNT)

    // unlock
    await staking.unlockAndRemoveManager(owner, user1, { from: user1 })

    assert.equal((await staking.unlockedBalanceOf(owner)).valueOf(), DEFAULT_STAKE_AMOUNT, "Unlocked balance should match")
    assert.equal((await staking.getTotalLockedOf(owner)).toString(), '0', "total locked doesn’t match")
  })

  it('unlocks with more than 1 lock, EOA manager', async () => {
    await approveStakeAndLock(user1)
    // lock again
    await staking.allowManagerAndLock(DEFAULT_LOCK_AMOUNT, user2, DEFAULT_LOCK_AMOUNT, EMPTY_DATA)

    const previousTotalLocked = await staking.getTotalLockedOf(owner)

    // unlock
    await staking.unlockAndRemoveManager(owner, user1, { from: user1 })

    assert.equal((await staking.unlockedBalanceOf(owner)).valueOf(), DEFAULT_STAKE_AMOUNT - DEFAULT_LOCK_AMOUNT, "Unlocked balance should match")
    assert.equal((await staking.getTotalLockedOf(owner)).toString(), (previousTotalLocked.sub(bn(DEFAULT_LOCK_AMOUNT))).toString(), "total locked doesn’t match")
  })

  it('unlocks completely, contract manager, called by owner', async () => {
    await lockManager.setResult(true)
    await approveStakeAndLock(lockManager.address)

    // unlock
    await staking.unlockAndRemoveManager(owner, lockManager.address, { from: owner })

    assert.equal((await staking.unlockedBalanceOf(owner)).valueOf(), DEFAULT_STAKE_AMOUNT, "Unlocked balance should match")
    assert.equal((await staking.getTotalLockedOf(owner)).toString(), '0', "total locked doesn’t match")
  })

  it('unlocks completely, contract manager, called by manager', async () => {
    await lockManager.setResult(true)
    await approveStakeAndLock(lockManager.address)

    // unlock
    await lockManager.unlockAndRemoveManager(staking.address, owner, lockManager.address)

    assert.equal((await staking.unlockedBalanceOf(owner)).valueOf(), DEFAULT_STAKE_AMOUNT, "Unlocked balance should match")
    assert.equal((await staking.getTotalLockedOf(owner)).toString(), '0', "total locked doesn’t match")
  })

  it('unlocks completely, contract manager, called by manager, even if condition is not satisfied', async () => {
    // not needed, is false by default
    //await lockManager.setResult(false)
    await approveStakeAndLock(lockManager.address)

    // unlock
    await lockManager.unlockAndRemoveManager(staking.address, owner, lockManager.address)

    assert.equal((await staking.unlockedBalanceOf(owner)).valueOf(), DEFAULT_STAKE_AMOUNT, "Unlocked balance should match")
    assert.equal((await staking.getTotalLockedOf(owner)).toString(), '0', "total locked doesn’t match")
  })

  it('fails calling canUnlock, EOA manager', async () => {
    await approveStakeAndLock(user1)

    // call canUnlock
    await assertRevert(staking.canUnlock(owner, user1, 0)) // no reason: it’s trying to call an EOA
  })

  it('can unlock if amount is zero', async () => {
    await staking.allowManager(user1, DEFAULT_LOCK_AMOUNT, EMPTY_DATA, { from: owner })
    assert.isTrue(await staking.canUnlock(owner, user1, 0), { from: owner })
  })

  it('fails to unlock if it cannot unlock, EOA manager', async () => {
    await approveStakeAndLock(user1)

    // tries to unlock
    await assertRevert(staking.unlockAndRemoveManager(owner, user1)) // no reason: it’s trying to call an EOA
  })

  it('fails to unlock if can not unlock, contract manager, called by owner', async () => {
    // not needed, is false by default
    // await lockManager.setResult(false)
    await approveStakeAndLock(lockManager.address)

    // tries to unlock
    await assertRevert(staking.unlockAndRemoveManager(owner, lockManager.address, { from: owner }), STAKING_ERRORS.ERROR_CANNOT_UNLOCK)
  })

  it('fails to unlock if, contract manager, called by 3rd party (even if condition is true)', async () => {
    await lockManager.setResult(true)
    await approveStakeAndLock(lockManager.address)

    // tries to unlock
    await assertRevert(staking.unlockAndRemoveManager(owner, lockManager.address, { from: user1 }), STAKING_ERRORS.ERROR_CANNOT_UNLOCK)
  })

  it('transfers (slash) and unlocks (everything else) in one transaction', async () => {
    const totalLock = 120
    const transferAmount = 40

    await approveStakeAndLock(user1, totalLock)

    // unlock and transfer
    await staking.slashAndUnlock(owner, user2, totalLock - transferAmount, transferAmount, { from: user1 })

    //assert.equal((await staking.unlockedBalanceOf(owner)).toString(), (totalLock - transferAmount).toString(), "Unlocked balance should match")
    assert.equal((await staking.getTotalLockedOf(owner)).toString(), '0', "total locked doesn’t match")
    // lock manager
    assert.equal((await staking.unlockedBalanceOf(user1)).toString(), '0', "Unlocked balance should match")
    assert.equal((await staking.getTotalLockedOf(user1)).toString(), '0', "total locked doesn’t match")
    // recipient
    assert.equal((await staking.unlockedBalanceOf(user2)).toString(), transferAmount.toString(), "Unlocked balance should match")
    assert.equal((await staking.getTotalLockedOf(user2)).toString(), '0', "total locked doesn’t match")
  })

  it('transfers (slash) and unlocks in one transaction', async () => {
    const totalLock = 120
    const transferAmount = 40
    const decreaseAmount = 60

    await approveStakeAndLock(user1, totalLock)

    // unlock and transfer
    await staking.slashAndUnlock(owner, user2, decreaseAmount, transferAmount, { from: user1 })

    assert.equal((await staking.unlockedBalanceOf(owner)).toString(), decreaseAmount.toString(), "Unlocked balance should match")
    assert.equal((await staking.getTotalLockedOf(owner)).toString(), totalLock - decreaseAmount - transferAmount, "total locked doesn’t match")
    // lock manager
    assert.equal((await staking.unlockedBalanceOf(user1)).toString(), '0', "Unlocked balance should match")
    assert.equal((await staking.getTotalLockedOf(user1)).toString(), '0', "total locked doesn’t match")
    // recipient
    assert.equal((await staking.unlockedBalanceOf(user2)).toString(), transferAmount.toString(), "Unlocked balance should match")
    assert.equal((await staking.getTotalLockedOf(user2)).toString(), '0', "total locked doesn’t match")
  })

  it('fails to transfer (slash) and unlocks in one transaction if unlock amount is zero', async () => {
    const totalLock = 120
    const transferAmount = 40
    const decreaseAmount = 0

    await approveStakeAndLock(user1, totalLock)

    // unlock and transfer
    await assertRevert(staking.slashAndUnlock(owner, user2, decreaseAmount, transferAmount, { from: user1 }), STAKING_ERRORS.ERROR_AMOUNT_ZERO)
  })

  it('fails to transfer (slash) and unlock in one transaction if not owner nor manager', async () => {
    const totalLock = 120
    const transferAmount = 40
    const decreaseAmount = 60

    await approveStakeAndLock(user1, totalLock)

    // unlock and transfer
    await assertRevert(staking.slashAndUnlock(owner, user2, decreaseAmount, transferAmount, { from: user2 }), STAKING_ERRORS.ERROR_NOT_ENOUGH_LOCK)
  })

  it('change lock amount', async () => {
    await approveStakeAndLock(lockManager.address)
    const { _amount: amount1 } = await staking.getLock(owner, lockManager.address)
    assertBn(amount1, bn(DEFAULT_LOCK_AMOUNT), "Amount should match")
    assert.equal((await staking.unlockedBalanceOf(owner)).valueOf(), DEFAULT_STAKE_AMOUNT - DEFAULT_LOCK_AMOUNT, "Unlocked balance should match")

    // change amount
    const unlockAmount = DEFAULT_LOCK_AMOUNT / 2
    await lockManager.unlock(staking.address, owner, unlockAmount)

    const { _amount: amount2 } = await staking.getLock(owner, lockManager.address)
    assertBn(amount2, bn(unlockAmount), "Amount should match")
    assert.equal((await staking.unlockedBalanceOf(owner)).valueOf(), DEFAULT_STAKE_AMOUNT - unlockAmount, "Unlocked balance should match")
  })

  it('fails to change lock amount to zero', async () => {
    await approveStakeAndLock(lockManager.address)

    // try to change amount
    await assertRevert(lockManager.unlock(staking.address, owner, 0), STAKING_ERRORS.ERROR_AMOUNT_ZERO)
  })

  it('fails to change lock amount to greater than before', async () => {
    await approveStakeAndLock(lockManager.address)

    // try to change amount
    await assertRevert(lockManager.unlock(staking.address, owner, DEFAULT_LOCK_AMOUNT + 1), STAKING_ERRORS.ERROR_NOT_ENOUGH_LOCK)
  })

  it('change lock manager', async () => {
    await approveStakeAndLock(user1)
    assert.equal(await staking.canUnlock(owner, user1, 0, { from: user1 }), true, "User 1 can unlock")
    assert.equal(await staking.canUnlock(owner, user1, 0, { from: user2 }), false, "User 2 can not unlock")
    await assertRevert(staking.canUnlock(owner, user2, 0, { from: user2 }), STAKING_ERRORS.ERROR_LOCK_DOES_NOT_EXIST) // it doesn’t exist

    // change manager
    await staking.setLockManager(owner, user2, { from: user1 })

    await assertRevert(staking.canUnlock(owner, user1, 0, { from: user1 }), STAKING_ERRORS.ERROR_LOCK_DOES_NOT_EXIST) // it doesn’t exist
    assert.equal(await staking.canUnlock(owner, user2, 0, { from: user1 }), false, "User 1 can not unlock")
    assert.equal(await staking.canUnlock(owner, user2, 0, { from: user2 }), true, "User 2 can unlock")
  })
})
