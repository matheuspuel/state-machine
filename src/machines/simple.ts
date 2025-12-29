import { makeStateMachine } from '..'

export const simpleStateMachine = <A>(initialState: A) =>
  makeStateMachine<A>()({
    initialState,
    actions: ({ Store }) => ({ set: (value: A) => Store.update(() => value) }),
  })
