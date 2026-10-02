import { useState } from 'react';
import { getDashboard } from '../services/performanceService.js';
import { useApi } from './useApi.js';

export function useDashboard(initialPeriod = 'week') {
  const [period, setPeriod] = useState(initialPeriod);
  const result = useApi((signal) => getDashboard(period, { signal }), [period]);
  return { ...result, period, setPeriod };
}
