import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthContext';

/** Page + search state for management tables; changing the search resets to page 1. */
export function useTableState<F extends Record<string, string>>(initialFilters: F) {
  const [page, setPage] = useState(1);
  const [search, setSearchValue] = useState('');
  const [filters, setFilters] = useState<F>(initialFilters);
  const setSearch = useCallback((value: string) => {
    setSearchValue(value);
    setPage(1);
  }, []);
  const setFilter = useCallback(<K extends keyof F>(key: K, value: F[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);
  return { page, setPage, search, setSearch, filters, setFilter };
}

interface SaveOptions<TValues extends FieldValues, TResult> {
  mutationFn: (values: TValues) => Promise<TResult>;
  success: string | ((result: TResult) => string);
  onDone?: (result: TResult) => void;
  setError?: UseFormSetError<TValues>;
}

/**
 * Mutation wrapper for forms: toasts the outcome, refreshes cached lists and
 * maps server-side validation errors back onto the matching form fields.
 */
export function useSave<TValues extends FieldValues, TResult = unknown>({ mutationFn, success, onDone, setError }: SaveOptions<TValues, TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      toast.success(typeof success === 'function' ? success(result) : success);
      queryClient.invalidateQueries();
      onDone?.(result);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && setError && err.fieldErrors.length) {
        for (const fe of err.fieldErrors) setError(fe.field as Path<TValues>, { message: fe.message });
        return toast.error('Please check the highlighted fields');
      }
      toast.error(errorMessage(err));
    },
  });
}

/** `/admin` or `/operator`, plus whether the user may manage master data. */
export function useConsole() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  return { base: isAdmin ? '/admin' : '/operator', isAdmin };
}
