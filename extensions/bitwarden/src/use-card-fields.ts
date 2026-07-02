import { useState } from 'react';
import { digitsOnly } from './item-form';

export function useCardFields() {
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cardCode, setCardCode] = useState('');

  return {
    expMonth,
    setExpMonth: (v: string) => setExpMonth(digitsOnly(v)),
    expYear,
    setExpYear: (v: string) => setExpYear(digitsOnly(v)),
    cardCode,
    setCardCode: (v: string) => setCardCode(digitsOnly(v)),
  };
}
