import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
// import { createClient } from '@supabase/supabase-js'

// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
// const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const razorpay = new Razorpay({
  key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || ''
})

// Supabase disabled — this route will not verify auth or store orders in DB
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { planId, amount } = body

    if (!planId || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const options = {
      amount: amount * 100,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        planId,
      }
    }

    const order = await razorpay.orders.create(options)

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    })
  } catch (error: any) {
    console.error('Create order error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create order' },
      { status: 500 }
    )
  }
}


