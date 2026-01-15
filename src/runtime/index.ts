import { Array, Effect, Ref } from 'effect'
import {
  AnyStateActions,
  makeStore,
  prepareActions,
  PreparedStateActions,
  StateMachine,
} from '../definition.js'

type SubscriptionTask<State> = (state: State) => Effect.Effect<void>

export type Instance<State, Actions extends AnyStateActions> = {
  ref: Ref.Ref<State>
  actions: PreparedStateActions<Actions>
  startPromise: Promise<unknown> | undefined
  subscribe: (
    task: SubscriptionTask<State>,
  ) => Effect.Effect<
    { unsubscribe: Effect.Effect<void, never, never> },
    never,
    never
  >
}

export const run = <State, Actions extends AnyStateActions>(
  machine: StateMachine<State, Actions>,
): Instance<State, Actions> => {
  const subscriptionsRef = Ref.unsafeMake<SubscriptionTask<State>[]>([])
  const ref = Ref.unsafeMake(machine.initialState)
  const store = makeStore<State>({
    get: () => ref.get.pipe(Effect.runSync),
    update: fn =>
      Effect.gen(function* () {
        const previousState = yield* ref.get
        const state = fn(previousState)
        yield* Ref.set(ref, state)
        yield* Effect.forEach(yield* subscriptionsRef.get, _ => _(state)).pipe(
          Effect.exit,
        )
        void machine.onUpdate?.(state)
      }).pipe(Effect.runSync),
  })
  const actions = prepareActions(machine, store)
  const subscribe = (task: SubscriptionTask<State>) =>
    Effect.gen(function* () {
      yield* Ref.update(subscriptionsRef, Array.append(task))
      return {
        unsubscribe: Ref.update(
          subscriptionsRef,
          Array.filter(_ => _ !== task),
        ),
      }
    })
  const startPromise = machine.start?.({ Store: store })
  return { ref, actions, subscribe, startPromise }
}
