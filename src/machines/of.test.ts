import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { run } from '../runtime'
import { of } from './of'

describe('of', () => {
  it('should work', () => {
    const machine = of('')
    const instance = run(machine)
    instance.actions.set('a')
    const state = instance.ref.get.pipe(Effect.runSync)
    expect(state).toStrictEqual('a')
    const data = instance.actions.get()
    expect(data).toStrictEqual('a')
  })
})
