import { describe, expect, it } from '@effect/vitest'
import { StateMachine } from '@matheuspuel/state-machine'
import { Effect } from 'effect'

describe('FormValue', () => {
  it('should work', () => {
    const machine = StateMachine.FormValue<number, string>(0)
    const instance = StateMachine.run(machine)
    const getState = () => instance.ref.get.pipe(Effect.runSync)
    expect(getState()).toStrictEqual({ value: 0, error: null })
    instance.actions.set(1)
    expect(getState()).toStrictEqual({ value: 1, error: null })
    instance.actions.error.set('a')
    expect(getState()).toStrictEqual({ value: 1, error: 'a' })
    instance.actions.set(2)
    expect(getState()).toStrictEqual({ value: 2, error: null })
  })
})
