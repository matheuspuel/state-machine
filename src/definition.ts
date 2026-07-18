import { Optic } from '@matheuspuel/optic'

type IsAny<T> = 0 extends 1 & T ? true : false

export type StoreBase<State> = {
  get: () => State
  update: (stateUpdate: (_: State) => State) => void
}

export type Store<State> = StoreBase<State> & {
  zoom: IsAny<State> extends true
    ? any
    : <A, Optional extends boolean>(
        f: (optic: Optic<State, State>) => Optic<A, State, Optional>,
      ) => StoreBase<A>
}

export const makeStore = <State>(base: StoreBase<State>): Store<State> => ({
  ...base,
  zoom: zoomF => ({
    get: () => (zoomF(Optic.id<State>()) as any).get(base.get()),
    getOption: () => zoomF(Optic.id<State>()).getOption(base.get()),
    update: f => base.update(zoomF(Optic.id<State>()).update(f)),
  }),
})

export type StateAction<A extends unknown[], B> = (...args: A) => B

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyStateAction = StateAction<any[], unknown>

export type AnyStateActions = {
  [key: string]: AnyStateAction | AnyStateActions
}

export type StateMachinePropertiesWithoutInitialState<
  State,
  Actions extends AnyStateActions,
> = {
  actions: (machine: { Store: Store<State> }) => Actions
  start?: (machine: { Store: Store<State> }) => undefined | Promise<unknown>
  onUpdate?: (state: State) => void | Promise<void>
}

export class StateMachineWithoutInitialState<
  State,
  Actions extends AnyStateActions,
> {
  actions: (machine: { Store: Store<State> }) => Actions
  start?: (machine: { Store: Store<State> }) => undefined | Promise<unknown>
  onUpdate?: (state: State) => void | Promise<void>

  constructor(
    properties: StateMachinePropertiesWithoutInitialState<State, Actions>,
  ) {
    this.actions = properties.actions
    if (properties.start) this.start = properties.start
    if (properties.onUpdate) this.onUpdate = properties.onUpdate
  }

  setInitialState(initialState: State): StateMachine<State, Actions> {
    return new StateMachine<State, Actions>({ ...this, initialState })
  }

  mapActions<NextActions extends AnyStateActions>(
    f: (actions: Actions, machine: { Store: Store<State> }) => NextActions,
  ): StateMachineWithoutInitialState<State, NextActions> {
    return new StateMachineWithoutInitialState<State, NextActions>({
      ...this,
      actions: machine => f(this.actions(machine), machine),
    })
  }
}

export type StateMachineProperties<
  State,
  Actions extends AnyStateActions,
> = StateMachinePropertiesWithoutInitialState<State, Actions> & {
  initialState: State
}

export class StateMachine<
  State,
  Actions extends AnyStateActions,
> extends StateMachineWithoutInitialState<State, Actions> {
  initialState: State

  constructor(properties: StateMachineProperties<State, Actions>) {
    super(properties)
    this.initialState = properties.initialState
  }

  mapActions<NextActions extends AnyStateActions>(
    f: (actions: Actions, machine: { Store: Store<State> }) => NextActions,
  ): StateMachine<State, NextActions> {
    return new StateMachine<State, NextActions>({
      ...this,
      actions: machine => f(this.actions(machine), machine),
    })
  }
}

export type AnyStateMachineWithActions<Actions extends AnyStateActions> = {
  initialState: any
  actions: (machine: { Store: any }) => Actions
  start?: (machine: { Store: any }) => undefined | Promise<unknown>
  onUpdate?: (state: any) => void | Promise<void>
  mapActions: <NextActions extends AnyStateActions>(
    f: (actions: Actions, machine: { Store: Store<any> }) => NextActions,
  ) => StateMachine<any, NextActions>
}

export const makeWithoutState = <State, Actions extends AnyStateActions>(
  properties: StateMachinePropertiesWithoutInitialState<State, Actions>,
): StateMachineWithoutInitialState<State, Actions> =>
  new StateMachineWithoutInitialState(properties)

export const make = <State, Actions extends AnyStateActions>(
  properties: StateMachineProperties<State, Actions>,
): StateMachine<State, Actions> => new StateMachine(properties)

export const type = <State>() => ({
  make: <Actions extends AnyStateActions>(
    properties: StateMachineProperties<State, Actions>,
  ): StateMachine<State, Actions> => make(properties),

  makeWithoutState: <Actions extends AnyStateActions>(
    properties: StateMachinePropertiesWithoutInitialState<State, Actions>,
  ): StateMachineWithoutInitialState<State, Actions> =>
    makeWithoutState(properties),
})

export type PreparedStateActions<Actions extends AnyStateActions> = Actions

export const prepareActions = <State, Actions extends AnyStateActions>(
  machine: StateMachine<State, Actions>,
  store: Store<State>,
): PreparedStateActions<Actions> => machine.actions({ Store: store })
