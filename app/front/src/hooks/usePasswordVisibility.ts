import { useCallback, useState } from 'react';

export function usePasswordVisibility(initial = false) {
  const [visible, setVisible] = useState(initial);
  const toggle = useCallback(() => {
    setVisible((current) => !current);
  }, []);

  return {
    visible,
    toggle,
    inputType: visible ? ('text' as const) : ('password' as const),
  };
}
