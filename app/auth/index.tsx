/**
 * app/auth/index.tsx — Sign in / Sign up screen
 */

import React, { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { useAuth } from '../../src/context/AuthContext'
import { useDatabase } from '../../src/context/DatabaseContext'
import { pullAll, pushAll, isLocalEmpty } from '../../src/sync/syncService'
import { Colors } from '../../src/theme/colors'

type Mode = 'signin' | 'signup'

export default function AuthScreen() {
  const router  = useRouter()
  const { signIn, signUp, user } = useAuth()
  const { db }  = useDatabase()

  const [mode,     setMode]     = useState<Mode>('signin')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [showPass, setShowPass] = useState(false)

  // If already signed in, redirect away (must be in useEffect — never during render)
  useEffect(() => {
    if (user) router.replace('/(tabs)')
  }, [user])

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.')
      return
    }
    setError(null)
    setLoading(true)

    try {
      const errMsg = mode === 'signup'
        ? await signUp(email.trim(), password)
        : await signIn(email.trim(), password)

      if (errMsg) {
        setError(errMsg)
        return
      }

      // After sign in: push local data OR pull if this is a fresh device
      const { supabase } = await import('../../src/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user.id

      if (userId) {
        const fresh = await isLocalEmpty(db)
        if (fresh) {
          await pullAll(db, userId)
        } else {
          await pushAll(db, userId)
        }
      }

      router.replace('/(tabs)')
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Back */}
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={Colors.text.primary} />
          </TouchableOpacity>

          {/* Header */}
          <View style={s.header}>
            <View style={s.iconWrap}>
              <Ionicons name="cloud-outline" size={32} color={Colors.accent.default} />
            </View>
            <Text style={s.title}>
              {mode === 'signin' ? 'Welcome back' : 'Create account'}
            </Text>
            <Text style={s.subtitle}>
              {mode === 'signin'
                ? 'Sign in to sync your progress across devices'
                : 'Create an account to back up and sync your data'}
            </Text>
          </View>

          {/* Form */}
          <View style={s.form}>
            <View style={s.field}>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.text.faint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!loading}
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Password</Text>
              <View style={s.passwordWrap}>
                <TextInput
                  style={[s.input, { paddingRight: 48 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={Colors.text.faint}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => setShowPass(v => !v)}
                >
                  <Ionicons
                    name={showPass ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={Colors.text.muted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#f87171" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.submitBtn, loading && s.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.submitBtnText}>
                    {mode === 'signin' ? 'Sign in' : 'Create account'}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          {/* Toggle mode */}
          <View style={s.toggle}>
            <Text style={s.toggleText}>
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
            </Text>
            <TouchableOpacity onPress={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null) }}>
              <Text style={s.toggleLink}>
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.base },
  scroll: { flexGrow: 1, padding: 24 },

  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.bg.surface,
    borderWidth: 0.5, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 32,
  },

  header: { alignItems: 'center', marginBottom: 40 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: Colors.accent.dim,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  title:    { fontSize: 24, fontWeight: '700', color: Colors.text.primary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.text.muted, textAlign: 'center', lineHeight: 20 },

  form:  { gap: 16, marginBottom: 24 },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.text.muted, letterSpacing: 0.5, textTransform: 'uppercase' },

  input: {
    backgroundColor: Colors.bg.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: Colors.border.default,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: Colors.text.primary,
  },
  passwordWrap: { position: 'relative' },
  eyeBtn: { position: 'absolute', right: 14, top: 14 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(248,113,113,0.1)', borderRadius: 10,
    borderWidth: 0.5, borderColor: 'rgba(248,113,113,0.3)',
    padding: 12,
  },
  errorText: { flex: 1, fontSize: 13, color: '#f87171', lineHeight: 18 },

  submitBtn: {
    backgroundColor: Colors.accent.default, borderRadius: 13,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText:     { fontSize: 16, fontWeight: '700', color: '#fff' },

  toggle:     { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  toggleText: { fontSize: 14, color: Colors.text.muted },
  toggleLink: { fontSize: 14, fontWeight: '600', color: Colors.accent.default },
})
