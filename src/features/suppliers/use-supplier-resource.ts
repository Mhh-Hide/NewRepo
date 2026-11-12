import { useEffect, useState } from 'react';
import { supplierErrorMessage } from '../../services/supplier-types';
type Resource<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };
export function useSupplierResource<T>(load: () => Promise<T>) {
  const [request, setRequest] = useState(0);
  const [state, setState] = useState<{
    load: typeof load;
    result: Resource<T>;
  }>({ load, result: { status: 'loading' } });
  useEffect(() => {
    let active = true;
    load().then(
      (data) => {
        if (active) setState({ load, result: { status: 'ready', data } });
      },
      (error) => {
        if (active)
          setState({
            load,
            result: { status: 'error', message: supplierErrorMessage(error) },
          });
      },
    );
    return () => {
      active = false;
    };
  }, [load, request]);
  return {
    result:
      state.load === load ? state.result : ({ status: 'loading' } as const),
    reload: () => {
      setState({ load, result: { status: 'loading' } });
      setRequest((v) => v + 1);
    },
  };
}
