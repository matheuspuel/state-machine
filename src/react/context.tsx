import * as React from 'react'
import {
  AnyStateActions,
  PreparedStateActions,
  StateMachine,
} from '../definition.js'
import { useStateMachine } from './useStateMachine.js'

export const makeStateMachineContext = <State, Actions extends AnyStateActions>(
  machine: StateMachine<State, Actions>,
) => {
  const Context = React.createContext<{
    state: State
    actions: PreparedStateActions<Actions>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  }>(undefined as any)
  return {
    Provider: (props: { children: React.ReactNode }) => {
      const value = useStateMachine(machine)
      return <Context.Provider value={value}>{props.children}</Context.Provider>
    },
    useActions: () => React.useContext(Context).actions,
    useSelector: <A,>(fn: (state: State) => A) => {
      const state = React.useContext(Context).state
      // eslint-disable-next-line react-hooks/exhaustive-deps
      return React.useMemo(() => fn(state), [state])
    },
  }
}
