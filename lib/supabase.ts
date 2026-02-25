// import { createBrowserClient } from '@supabase/ssr'

// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
// const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

// Supabase disabled — export a stub so imports don't break
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null } }),
    getUser: async () => ({ data: { user: null } }),
    signInWithOAuth: async (_opts: any) => ({ error: null }),
    signInWithPassword: async (_opts: any) => ({ data: { user: null, session: null }, error: null }),
    signUp: async (_opts: any) => ({ data: { user: null, session: null }, error: null }),
    signOut: async () => {},
    onAuthStateChange: (_cb: any) => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  from: (_table: string) => ({
    select: (..._args: any[]) => ({
      eq: (..._args: any[]) => ({
        single: async () => ({ data: null, error: null }),
        order: (..._args: any[]) => ({ data: [], error: null }),
        data: [],
        error: null,
      }),
      single: async () => ({ data: null, error: null }),
      order: (..._args: any[]) => ({ data: [], error: null }),
      data: [],
      error: null,
    }),
    insert: async (_data: any) => ({ data: null, error: null }),
    update: (_data: any) => ({
      eq: async (..._args: any[]) => ({ data: null, error: null }),
    }),
    upsert: async (_data: any) => ({ data: null, error: null }),
    delete: () => ({
      eq: async (..._args: any[]) => ({ data: null, error: null }),
    }),
  }),
} as any
