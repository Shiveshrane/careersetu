'use client'
import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, X, Loader2, ArrowRight, Sparkles, Zap, Crown, LogIn } from "lucide-react"
import { Navbar } from "../../components/home-page/navbar"
import { GlobalStyles } from "../../components/home-page/global-styles"
import { Aurora } from "../../components/home-page/aurora"
import { useRouter } from "next/navigation"
// import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
// const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
// const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface Plan {
  id: string
  name: string
  price: number
  period: string
  description: string
  features: string[]
  icon: React.ElementType
  iconColor: string
  popular?: boolean
}

const plans: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: 100,
    period: 'month',
    description: 'Perfect for getting started with AI-powered learning',
    features: [
      '50 learning sessions per month',
      'Basic AI avatar teaching',
      'Core topics access',
      'Community support',
      'Progress tracking'
    ],
    icon: Sparkles,
    iconColor: 'text-blue-400'
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 200,
    period: 'month',
    description: 'For serious learners who want unlimited access',
    features: [
      'Unlimited learning sessions',
      'Advanced AI avatar with visuals',
      'All topics unlocked',
      'Priority support',
      'Advanced analytics',
      'Code execution environment'
    ],
    icon: Zap,
    iconColor: 'text-cyan-400',
    popular: true
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 500,
    period: 'month',
    description: 'Enterprise-grade learning with team collaboration',
    features: [
      'Everything in Pro',
      'Team collaboration features',
      'Custom integrations',
      'Dedicated support',
      'Advanced reporting',
      'Custom learning paths',
      'API access'
    ],
    icon: Crown,
    iconColor: 'text-purple-400'
  }
]

const PricingCard = ({ plan, onSubscribe, isProcessing }: { plan: Plan, onSubscribe: (planId: string) => void, isProcessing: string | null }) => {
  const Icon = plan.icon
  const isLoading = isProcessing === plan.id

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -8 }}
      className={`relative group h-full ${plan.popular ? 'md:scale-105' : ''}`}
    >
      {plan.popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
          <span className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg">
            MOST POPULAR
          </span>
        </div>
      )}
      
      <div 
        className="rounded-[32px] p-[1px] h-full"
        style={{
          background: plan.popular 
            ? 'linear-gradient(147deg, rgba(6, 182, 212, 0.3) 4%, rgba(59, 130, 246, 0.1) 61%)'
            : 'linear-gradient(147deg, rgba(255, 255, 255, 0.1) 4%, rgba(255, 255, 255, 0) 61%)'
        }}
      >
        <div className="relative rounded-[32px] bg-[#1c2026] overflow-hidden h-full flex flex-col">
          {plan.popular && (
            <div className="absolute inset-0 opacity-20">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-transparent" />
            </div>
          )}
          
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
          
          <div className="relative p-8 flex flex-col flex-grow z-10">
            <div className="flex items-center justify-between mb-6">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.popular ? 'from-cyan-500/20 to-blue-500/20' : 'from-white/5 to-white/10'} flex items-center justify-center`}>
                <Icon className={`w-6 h-6 ${plan.iconColor}`} />
              </div>
            </div>
            
            <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
            
            <div className="mb-4">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">₹{plan.price}</span>
                <span className="text-sm text-zinc-400">/{plan.period}</span>
              </div>
            </div>
            
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              {plan.description}
            </p>
            
            <div className="space-y-3 mb-8 flex-grow">
              {plan.features.map((feature, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-blue-400" />
                  </div>
                  <p className="text-sm text-white font-medium leading-relaxed">
                    {feature}
                  </p>
                </div>
              ))}
            </div>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSubscribe(plan.id)}
              disabled={isLoading || !!isProcessing}
              className={`w-full rounded-xl py-4 px-6 text-center text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 ${
                plan.popular
                  ? 'bg-gradient-to-b from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/30 hover:shadow-cyan-900/50'
                  : 'bg-gradient-to-b from-[#1c2026] to-[#12161c] border border-white/10 hover:border-white/20 text-white hover:bg-white/5'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Subscribe Now
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

const FAQItem = ({ question, answer }: { question: string, answer: string }) => {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="border-b border-white/5"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-6 text-left flex items-center justify-between text-white hover:text-cyan-400 transition-colors"
      >
        <span className="font-medium text-lg">{question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <ArrowRight className={`w-5 h-5 transform rotate-90`} />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <p className="pb-6 text-zinc-400 leading-relaxed">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const PaymentModal = ({ isOpen, onClose, status, message }: { isOpen: boolean, onClose: () => void, status: 'success' | 'error' | null, message: string }) => {
  const router = useRouter()

  const handleClose = () => {
    onClose()
    if (status === 'success') {
      // Redirect to home page instead of /learn to avoid mermaid issues
      router.push('/')
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={handleClose}
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
            
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white transition-colors rounded-full hover:bg-white/5 z-20"
            >
              <X size={20} />
            </button>

            <div className="p-8 pt-12 flex flex-col items-center text-center relative z-10">
              <div className={`mb-6 relative w-20 h-20 rounded-full flex items-center justify-center ${
                status === 'success' ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                {status === 'success' ? (
                  <Check className="w-10 h-10 text-green-400" />
                ) : (
                  <X className="w-10 h-10 text-red-400" />
                )}
              </div>

              <h2 className="text-2xl font-bold text-white mb-3">
                {status === 'success' ? 'Payment Successful!' : 'Payment Failed'}
              </h2>
              
              <p className="text-zinc-400 mb-8 leading-relaxed">
                {message}
              </p>

              {status === 'success' ? (
                <div className="flex flex-col gap-3 w-full">
                  <a
                    href="/"
                    className="w-full py-3 bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white rounded-xl font-semibold transition-all text-center"
                  >
                    Go to Home
                  </a>
                  <button
                    onClick={onClose}
                    className="w-full py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl font-medium transition-all"
                  >
                    Stay Here
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleClose}
                  className="w-full py-3 bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white rounded-xl font-semibold transition-all"
                >
                  Try Again
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

const AuthModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_return_url', window.location.href)
    }
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.href,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })
      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
            
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white transition-colors rounded-full hover:bg-white/5 z-20"
            >
              <X size={20} />
            </button>

            <div className="p-8 pt-12 flex flex-col items-center text-center relative z-10">
              <div className="mb-6 relative">
                <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full" />
                <div className="relative z-10 w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <LogIn className="w-8 h-8 text-white" />
                </div>
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">Sign In Required</h2>
              <p className="text-zinc-400 mb-8 leading-relaxed">
                Please sign in to continue with your subscription
              </p>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs font-medium"
                >
                  {error}
                </motion.div>
              )}

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full relative flex items-center justify-center gap-3 py-3 bg-white hover:bg-zinc-200 text-black rounded-xl font-semibold text-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-lg"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              <p className="mt-6 text-[10px] text-zinc-600">
                By continuing, you agree to our Terms of Service
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default function PricingPage() {
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalStatus, setModalStatus] = useState<'success' | 'error' | null>(null)
  const [modalMessage, setModalMessage] = useState('')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const router = useRouter()

  const handleSubscribe = async (planId: string) => {
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      setShowAuthModal(true)
      return
    }

    setIsProcessing(planId)

    try {
      const plan = plans.find(p => p.id === planId)
      if (!plan) throw new Error('Plan not found')

      // Get auth token
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession) {
        throw new Error('Authentication required')
      }

      // Create order
      const orderResponse = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authSession.access_token}`
        },
        body: JSON.stringify({
          planId: plan.id,
          amount: plan.price
        })
      })

      if (!orderResponse.ok) {
        throw new Error('Failed to create order')
      }

      const orderData = await orderResponse.json()

      // Load Razorpay script
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      document.body.appendChild(script)

      script.onload = () => {
        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: orderData.amount,
          currency: orderData.currency,
          name: 'Outlrn',
          description: `${plan.name} Plan Subscription`,
          order_id: orderData.orderId,
          handler: async (response: any) => {
            try {
              // Get auth token
              const { data: { session: verifySession } } = await supabase.auth.getSession()
              if (!verifySession) {
                throw new Error('Authentication required')
              }

              // Verify payment
              const verifyResponse = await fetch('/api/razorpay/verify-payment', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${verifySession.access_token}`
                },
                body: JSON.stringify({
                  orderId: response.razorpay_order_id,
                  paymentId: response.razorpay_payment_id,
                  signature: response.razorpay_signature
                })
              })

              if (!verifyResponse.ok) {
                throw new Error('Payment verification failed')
              }

              setModalStatus('success')
              setModalMessage('Your subscription has been activated successfully! You can now access all premium features.')
              setShowModal(true)
            } catch (error) {
              console.error('Verification error:', error)
              setModalStatus('error')
              setModalMessage('Payment verification failed. Please contact support.')
              setShowModal(true)
            } finally {
              setIsProcessing(null)
            }
          },
          modal: {
            ondismiss: () => {
              setIsProcessing(null)
            }
          },
          prefill: {
            email: session.user.email
          },
          theme: {
            color: '#06b6d4'
          }
        }

        const razorpay = new (window as any).Razorpay(options)
        razorpay.on('payment.failed', (response: any) => {
          setModalStatus('error')
          setModalMessage('Payment failed. Please try again.')
          setShowModal(true)
          setIsProcessing(null)
        })
        razorpay.open()
      }

      script.onerror = () => {
        setModalStatus('error')
        setModalMessage('Failed to load payment gateway. Please try again.')
        setShowModal(true)
        setIsProcessing(null)
      }
    } catch (error) {
      console.error('Payment error:', error)
      setModalStatus('error')
      setModalMessage('Something went wrong. Please try again.')
      setShowModal(true)
      setIsProcessing(null)
    }
  }

  const faqs = [
    {
      question: 'How do I cancel my subscription?',
      answer: 'You can cancel your subscription anytime from your account settings. Your access will continue until the end of your billing period.'
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit cards, debit cards, UPI, and net banking through Razorpay payment gateway.'
    },
    {
      question: 'Can I upgrade or downgrade my plan?',
      answer: 'Yes, you can upgrade or downgrade your plan anytime. The changes will be reflected in your next billing cycle.'
    },
    {
      question: 'Is there a refund policy?',
      answer: 'We offer a 7-day money-back guarantee. If you\'re not satisfied, contact us within 7 days for a full refund.'
    },
    {
      question: 'Do you offer discounts for students?',
      answer: 'Yes! We offer special discounts for students and educational institutions. Contact our support team for more details.'
    }
  ]

  return (
    <div className="min-h-screen bg-[#0b0f15] text-white selection:bg-blue-500/30 relative">
      <GlobalStyles />
      <Navbar />
      
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
      
      <PaymentModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        status={modalStatus}
        message={modalMessage}
      />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        <Aurora 
          colorStops={["#0029FF", "#2E9AFF", "#0055FF"]} 
          blend={0.8} 
          amplitude={1.2} 
          speed={1.2}
        />
        
        <div className="container mx-auto max-w-7xl relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-wider text-zinc-300 mb-6"
            >
              <Sparkles className="w-4 h-4" />
              Simple Pricing
            </motion.div>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight">
              Choose Your{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-400">
                Learning Journey
              </span>
            </h1>
            
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              Start free, scale as you grow. All plans include core features with no hidden fees.
            </p>
          </motion.div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto mb-20">
            {plans.map((plan) => (
              <PricingCard
                key={plan.id}
                plan={plan}
                onSubscribe={handleSubscribe}
                isProcessing={isProcessing}
              />
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-6 relative bg-[#0b0f14]">
        <div className="container mx-auto max-w-3xl relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-zinc-400 text-lg">
              Everything you need to know about pricing and subscriptions
            </p>
          </motion.div>

          <div className="space-y-2">
            {faqs.map((faq, index) => (
              <FAQItem key={index} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 relative bg-[#0b0f14] border-t border-white/5">
        <div className="container mx-auto max-w-4xl relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to transform your learning?
            </h2>
            <p className="text-xl text-zinc-400 mb-8">
              Join thousands of learners already using Outlrn
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push('/learn')}
              className="bg-gradient-to-b from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg shadow-cyan-900/30 hover:shadow-cyan-900/50 transition-all"
            >
              Start Learning Now
            </motion.button>
          </motion.div>
        </div>
      </section>
    </div>
  )
}


