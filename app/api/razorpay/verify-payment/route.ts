import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
// import { createClient } from '@supabase/supabase-js'

// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
// const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Supabase disabled — payment verification without DB
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId, paymentId, signature } = body

    if (!orderId || !paymentId || !signature) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify signature
    const text = `${orderId}|${paymentId}`
    const secret = process.env.RAZORPAY_KEY_SECRET || ''
    
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(text)
      .digest('hex')

    if (generatedSignature !== signature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully'
    })
  } catch (error: any) {
    console.error('Verify payment error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to verify payment' },
      { status: 500 }
    )
  }
}


