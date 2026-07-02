import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Standard-Helfer von shadcn/ui: kombiniert Klassen und löst Tailwind-Konflikte auf.
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
