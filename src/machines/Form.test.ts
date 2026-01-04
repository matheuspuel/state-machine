import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { StateMachine } from '..'
import { Form } from '../form'
import { run } from '../runtime'

describe('Form', () => {
  it('should work', () => {
    const formField = Form.field({
      initial: 0,
      validate: _ =>
        _ > 1 ? Effect.succeed({ n: _ }) : Effect.fail('low' as const),
      fromData: (data: { n: number }) => data.n,
    })
    const form = Form.Struct({
      a: formField,
      b: Form.Struct({ c: formField }),
    })
    const machine = StateMachine.Form(form)
    const instance = run(machine)
    const getState = () => instance.ref.get.pipe(Effect.runSync)
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      a: { value: 0, error: null },
      b: { c: { value: 0, error: null } },
    })
    instance.actions.a.set(1)
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      a: { value: 1, error: null },
      b: { c: { value: 0, error: null } },
    })
    instance.actions.validate().pipe(Effect.runSyncExit)
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      a: { value: 1, error: 'low' },
      b: { c: { value: 0, error: 'low' } },
    })
    instance.actions.a.update(_ => _ + 1)
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      a: { value: 2, error: null },
      b: { c: { value: 0, error: 'low' } },
    })
    instance.actions.b.c.set(1)
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      a: { value: 2, error: null },
      b: { c: { value: 1, error: null } },
    })
    instance.actions.validate().pipe(Effect.runSyncExit)
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      a: { value: 2, error: null },
      b: { c: { value: 1, error: 'low' } },
    })
    instance.actions.b.c.update(_ => _ + 1)
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      a: { value: 2, error: null },
      b: { c: { value: 2, error: null } },
    })
    const data = instance.actions.validate().pipe(Effect.runSync)
    expect(data).toStrictEqual<typeof data>({ a: { n: 2 }, b: { c: { n: 2 } } })
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      a: { value: 2, error: null },
      b: { c: { value: 2, error: null } },
    })
    instance.actions.setStateFromData({ a: { n: 3 }, b: { c: { n: 3 } } })
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      a: { value: 3, error: null },
      b: { c: { value: 3, error: null } },
    })
  })
})
