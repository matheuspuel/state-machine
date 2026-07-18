import { describe, expect, it } from '@effect/vitest'
import { StateMachine } from '@matheuspuel/state-machine'
import { Effect, pipe } from 'effect'

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

describe('Struct', () => {
  it('should work', () => {
    const machine = pipe(
      StateMachine.Struct({
        a: StateMachine.of(0),
        b: StateMachine.of(''),
      }),
      base =>
        StateMachine.make({
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

  describe('Array', () => {
    it('should work', () => {
      const machine = StateMachine.Array(StateMachine.of(0))
      const instance = StateMachine.run(machine)
      const getState = () => instance.ref.get.pipe(Effect.runSync)
      expect(getState()).toStrictEqual([])
      instance.actions.append(1)
      instance.actions.append(2)
      expect(getState()).toStrictEqual([1, 2])
      expect(instance.actions.index(1)?.get()).toStrictEqual(2)
      expect(instance.actions.index(2)).toStrictEqual(null)
      expect(instance.actions.find(_ => _ === 2)?.get()).toStrictEqual(2)
      instance.actions.index(0)?.update(_ => _ + 10)
      expect(getState()).toStrictEqual([11, 2])
      instance.actions.index(1)?.set(22)
      expect(getState()).toStrictEqual([11, 22])
      instance.actions.remove(1)
      expect(getState()).toStrictEqual([11])
      instance.actions.appendInitial()
      expect(getState()).toStrictEqual([11, 0])
    })
  })

  describe('Record', () => {
    it('with key type', () => {
      type Id = string & { brand: 'Id' }
      const makeId = (value: string) => value as Id
      const machine = StateMachine.Record.keyType<Id>()(StateMachine.of(0))
      const instance = StateMachine.run(machine)
      const getState = () => instance.ref.get.pipe(Effect.runSync)
      expect(getState()).toStrictEqual({})
      instance.actions.insert(makeId('a'), 1)
      expect(getState()).toStrictEqual({ a: 1 })
      instance.actions.insert(makeId('b'), 0)
      instance.actions.insert(makeId('b'), 2)
      expect(getState()).toStrictEqual({ a: 1, b: 2 })
      expect(instance.actions.key(makeId('a'))?.get()).toStrictEqual(1)
      expect(instance.actions.key(makeId('c'))).toStrictEqual(null)
      expect(
        instance.actions.find((v, k) => v === 2 && k === makeId('b'))?.get(),
      ).toStrictEqual(2)
      instance.actions.key(makeId('a'))?.update(_ => _ + 10)
      expect(getState()).toStrictEqual({ a: 11, b: 2 })
      instance.actions.key(makeId('b'))?.set(22)
      expect(getState()).toStrictEqual({ a: 11, b: 22 })
      instance.actions.remove(makeId('b'))
      expect(getState()).toStrictEqual({ a: 11 })
    })

    it('with key extractor', () => {
      type Id = string & { brand: 'Id' }
      const makeId = (value: string) => value as Id
      const machine = StateMachine.Record(StateMachine.of(0), {
        getKey: _ => makeId(_.toString()),
      })
      const instance = StateMachine.run(machine)
      const getState = () => instance.ref.get.pipe(Effect.runSync)
      expect(getState()).toStrictEqual({})
      instance.actions.insert(1)
      expect(getState()).toStrictEqual({ '1': 1 })
      instance.actions.insert(2)
      expect(getState()).toStrictEqual({ '1': 1, '2': 2 })
      expect(instance.actions.key(makeId('1'))?.get()).toStrictEqual(1)
      expect(instance.actions.key(makeId('3'))).toStrictEqual(null)
      expect(
        instance.actions.find((v, k) => v === 2 && k === makeId('2'))?.get(),
      ).toStrictEqual(2)
      instance.actions.key(makeId('1'))?.update(_ => _ + 10)
      expect(getState()).toStrictEqual({ '1': 11, '2': 2 })
      instance.actions.key(makeId('2'))?.set(22)
      expect(getState()).toStrictEqual({ '1': 11, '2': 22 })
      instance.actions.remove(makeId('2'))
      expect(getState()).toStrictEqual({ '1': 11 })
    })
  })
})
