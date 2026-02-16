import { createClient } from '@supabase/supabase-js'

// Pobranie kluczy z zmiennych środowiskowych (Vite)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
    console.error('Supabase URL jest nieprawidłowy lub brakujący! Sprawdź Secrets w GitHub.')
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder')
