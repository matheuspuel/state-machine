import { describe, expect, it } from '@effect/vitest'
import { Form, StateMachine } from '@matheuspuel/state-machine'
import { Effect } from 'effect'
import { NoSuchElementException } from 'effect/Cause'
import { ValidationError } from './index.js'

describe('Form', () => {
  it('should work', () => {
    const formField = Form.Field.of(0).parse({
      to: _ => (_ > 1 ? Effect.succeed({ n: _ }) : Effect.fail('low' as const)),
      from: (data: { n: number }) => data.n,
    })
    const machine = Form.Struct({
      a: formField,
      b: Form.Struct({ c: formField }),
    })
    const instance = StateMachine.run(machine)
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

  it('TaggedUnion', () => {
    const stateMachine = Form.TaggedUnion('_tag', {
      A: Form.Struct({ a: Form.Field.of(0), x: Form.Field.of('') }),
      B: Form.Struct({ b: Form.Field.of(0), x: Form.Field.of('') }),
    })
    const form = StateMachine.run(stateMachine)
    const getState = () => form.ref.get.pipe(Effect.runSync)

    form.actions.A.a.set(1)
    form.actions.A.x.set('a')
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      _tag: { value: 'A', error: null },
      A: { a: { value: 1, error: null }, x: { value: 'a', error: null } },
      B: { b: { value: 0, error: null }, x: { value: '', error: null } },
    })
    const dataA = form.actions.validate().pipe(Effect.runSync)
    expect(dataA).toStrictEqual<typeof dataA>({
      _tag: 'A',
      a: 1,
      x: 'a',
    })
    form.actions._tag.set('B')
    const dataB = form.actions.validate().pipe(Effect.runSync)
    expect(dataB).toStrictEqual<typeof dataB>({
      _tag: 'B',
      b: 0,
      x: '',
    })
  })

  it('Array', () => {
    const stateMachine = Form.Struct({
      list: Form.Array(Form.Struct({ a: Form.Field.NonEmptyString })),
    })
    const form = StateMachine.run(stateMachine)
    const getState = () => form.ref.get.pipe(Effect.runSync)

    form.actions.validate().pipe(Effect.runSyncExit)
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      list: [],
    })
    form.actions.list.addItem()
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      list: [{ a: { value: '', error: null } }],
    })
    form.actions.validate().pipe(Effect.runSyncExit)
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      list: [{ a: { value: '', error: new NoSuchElementException() } }],
    })
    form.actions.list.index(0).a.set('aaa')
    const data = form.actions.validate().pipe(Effect.runSync)
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      list: [{ a: { value: 'aaa', error: null } }],
    })
    expect(data).toStrictEqual<typeof data>({
      list: [{ a: 'aaa' }],
    })
    form.actions.list.addItem()
    form.actions.list.removeItem(0)
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      list: [{ a: { value: '', error: null } }],
    })
    form.actions.setStateFromData({ list: [{ a: '1' }, { a: '2' }] })
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      list: [
        { a: { value: '1', error: null } },
        { a: { value: '2', error: null } },
      ],
    })
  })

  it('change password example', () => {
    const stateMachine = Form.Struct({
      oldPassword: Form.Field.of(''),
      newPassword: StateMachine.mapActions(
        Form.Struct({
          password: Form.Field.of(''),
          confirmation: Form.Field.of('').withError<'not-match'>(),
        }),
        actions => ({
          ...actions,
          validate: () =>
            Effect.gen(function* () {
              const result = yield* actions.validate()
              if (result.password !== result.confirmation) {
                actions.confirmation.error.set('not-match' as const)
                return yield* new ValidationError({
                  error: 'not-match' as const,
                })
              }
              return result.password
            }),
          setStateFromData: (password: string) =>
            actions.setStateFromData({ password, confirmation: password }),
        }),
      ),
    })
    const form = StateMachine.run(stateMachine)
    const getState = () => form.ref.get.pipe(Effect.runSync)

    form.actions.newPassword.password.set('123456')
    form.actions.newPassword.confirmation.set('1234567')
    form.actions.validate().pipe(Effect.runSyncExit)
    expect(getState()).toStrictEqual<ReturnType<typeof getState>>({
      oldPassword: { value: '', error: null },
      newPassword: {
        password: { value: '123456', error: null },
        confirmation: { value: '1234567', error: 'not-match' },
      },
    })
    form.actions.newPassword.confirmation.set('123456')
    const data = form.actions.validate().pipe(Effect.runSync)
    expect(data).toStrictEqual<typeof data>({
      oldPassword: '',
      newPassword: '123456',
    })
  })
})
