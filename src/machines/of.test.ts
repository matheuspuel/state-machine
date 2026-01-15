import { describe, expect, it } from '@effect/vitest'
import { StateMachine } from '@matheuspuel/state-machine'
import { Effect } from 'effect'

describe('of', () => {
  it('should work', () => {
    const machine = StateMachine.of('')
    const instance = StateMachine.run(machine)
    instance.actions.set('a')
    const state = instance.ref.get.pipe(Effect.runSync)
    expect(state).toStrictEqual('a')
    const data = instance.actions.get()
    expect(data).toStrictEqual('a')
  })
})
