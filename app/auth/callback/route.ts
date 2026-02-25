// import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// Supabase disabled — auth callback is a no-op redirect
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const next = searchParams.get('next') ?? '/learn'
  return NextResponse.redirect(`${origin}${next}`)
}