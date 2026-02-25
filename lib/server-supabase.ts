// import { createServerClient } from '@supabase/ssr'
// import { cookies } from 'next/headers'

// Supabase disabled — export a stub
export async function createClient() {
  // const cookieStore = await cookies()

  // return createServerClient(
  //   process.env.NEXT_PUBLIC_SUPABASE_URL!,
  //   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  //   {
  //     cookies: {
  //       getAll() {
  //         return cookieStore.getAll()
  //       },
  //       setAll(cookiesToSet) {
  //         try {
  //           cookiesToSet.forEach(({ name, value, options }) =>
  //             cookieStore.set(name, value, options)
  //           )
  //         } catch {
  //         }
  //       },
  //     },
  //   }
  // )

  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
    from: (_table: string) => ({
      select: (..._args: any[]) => ({
        eq: (..._args: any[]) => ({
          single: async () => ({ data: null, error: null }),
        }),
        single: async () => ({ data: null, error: null }),
      }),
    }),
  } as any
}