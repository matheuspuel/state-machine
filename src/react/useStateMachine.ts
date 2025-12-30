import * as React from 'react'
import {
  AnyStateActions,
  makeStore,
  prepareActions,
  StateMachine,
} from '../definition'

export const useStateMachine = <State, Actions extends AnyStateActions>(
  stateMachine:
    | StateMachine<State, Actions>
    | (() => StateMachine<State, Actions>),
) => {
  const machine =
    typeof stateMachine === 'function' ? stateMachine() : stateMachine
  const [state, setState] = React.useState(() => machine.initialState)
  const stateRef = React.useRef(machine.initialState)
  const getState = React.useMemo(() => () => stateRef.current, [])
  const store = React.useMemo(
    () =>
      makeStore<State>({
        get: getState,
        update: fn => {
          const previousState = getState()
          const state = fn(previousState)
          stateRef.current = state
          void machine.onUpdate?.(state)
          setState(() => state)
        },
      }),
    [machine, getState],
  )
  const actions = React.useMemo(
    () => prepareActions(machine, store),
    [machine, store],
  )
  React.useEffect(() => {
    void machine.start?.({ Store: store })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { state, actions }
}
