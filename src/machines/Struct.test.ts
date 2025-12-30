import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { run } from '../runtime'
import { Struct } from './Struct'
import { of } from './of'

describe('Struct', () => {
  it('should work', () => {
    const machine = Struct(
      {
        a: of(0),
        b: of(''),
      },
      {
        extraActions: ({ Store }) => ({
          get: () => Store.get(),
        }),
      },
    )
    const instance = run(machine)
    const getState = () => instance.ref.get.pipe(Effect.runSync)
    expect(getState()).toStrictEqual({ a: 0, b: '' })
    instance.actions.a.set(1)
    expect(getState()).toStrictEqual({ a: 1, b: '' })
    instance.actions.b.set('a')
    expect(getState()).toStrictEqual({ a: 1, b: 'a' })
    expect(instance.actions.get()).toStrictEqual({ a: 1, b: 'a' })
  })
})
