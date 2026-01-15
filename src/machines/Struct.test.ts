import { describe, expect, it } from '@effect/vitest'
import { StateMachine } from '@matheuspuel/state-machine'
import { Effect, pipe } from 'effect'

describe('Struct', () => {
  it('should work', () => {
    const machine = pipe(
      StateMachine.Struct({
        a: StateMachine.of(0),
        b: StateMachine.of(''),
      }),
      base =>
        StateMachine.make<(typeof base)['initialState']>()({
          ...base,
          actions: ({ Store }) => ({
            ...base.actions({ Store }),
            get: () => Store.get(),
          }),
        }),
    )
    const instance = StateMachine.run(machine)
    const getState = () => instance.ref.get.pipe(Effect.runSync)
    expect(getState()).toStrictEqual({ a: 0, b: '' })
    instance.actions.a.set(1)
    expect(getState()).toStrictEqual({ a: 1, b: '' })
    instance.actions.b.set('a')
    expect(getState()).toStrictEqual({ a: 1, b: 'a' })
    expect(instance.actions.get()).toStrictEqual({ a: 1, b: 'a' })
  })
})
