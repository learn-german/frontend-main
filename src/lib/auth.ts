import { supabase } from './supabase'

export async function signUp(email: string, password: string, fullName: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  })
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    // href chứ không phải origin: OAuth reload cả trang, nên URL đích phải
    // được giữ lại thì deep-link mới quay về đúng chỗ sau khi đăng nhập.
    options: { redirectTo: window.location.href }
  })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function resetPassword(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`
  })
}
