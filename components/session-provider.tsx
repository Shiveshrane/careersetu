"use client"

import { createContext, useContext } from 'react'
// import { supabase } from '@/lib/supabase'
// import type { User, Session } from '@supabase/supabase-js'
// import { useRouter, usePathname } from 'next/navigation'

interface SessionContextType {
  user: null
  session: null
  loading: boolean
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextType>({
  user: null,
  session: null,
  loading: false,
  signOut: async () => {},
})

export function useSession() {
  return useContext(SessionContext)
}

// Supabase disabled — SessionProvider is now a simple passthrough
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionContext.Provider value={{ user: null, session: null, loading: false, signOut: async () => {} }}>
      {children}
    </SessionContext.Provider>
  )
}

