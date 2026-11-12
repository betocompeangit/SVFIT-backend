import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const app = express()
app.use(express.json())
app.use(cors())

// Cliente de Supabase con privilegios totales (Service Role Key)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Ruta de prueba
app.get('/api/health', (req, res) => {
  res.json({ status: 'SVFit Backend Serverless funcionando correctamente 🚀' })
})

// 1. ENDPOINT DE LOGIN SEGURO
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      return res.status(400).json({ error: 'Faltan datos de acceso.' })
    }

    const email = `${username.trim().toLowerCase()}@svfit.local`

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (authError || !authData.user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Perfil de usuario no encontrado.' })
    }

    res.json({ success: true, user: authData.user, profile, session: authData.session })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 2. ENDPOINT DE ALTA DE USUARIO (ADMIN)
app.post('/api/users', async (req, res) => {
  try {
    const { username, password, fullName, role, phone, planName, startDate, endDate, paymentDay } = req.body
    const email = `${username.trim().toLowerCase()}@svfit.local`

    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    })

    if (userError) return res.status(400).json({ error: userError.message })

    const userId = userData.user.id

    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      full_name: fullName,
      email,
      role: role || 'member',
      phone,
      must_change_password: true
    })

    if (profileError) return res.status(400).json({ error: profileError.message })

    if (role === 'member') {
      const { error: memberError } = await supabase.from('memberships').insert({
        user_id: userId,
        plan_name: planName || 'Mensualidad General',
        status: 'active',
        start_date: startDate,
        end_date: endDate,
        payment_day: paymentDay || 5
      })
      if (memberError) return res.status(400).json({ error: memberError.message })
    }

    res.json({ success: true, message: 'Usuario creado exitosamente', userId })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 3. ENDPOINT PARA LISTAR PERFILES Y MEMBRESÍAS
app.get('/api/profiles', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, memberships(*)')
      .order('created_at', { ascending: false })

    if (error) return res.status(400).json({ error: error.message })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 4. ENDPOINT PARA CAMBIAR CONTRASEÑA
app.post('/api/change-password', async (req, res) => {
  try {
    const { userId, newPassword } = req.body

    const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword
    })

    if (authError) return res.status(400).json({ error: authError.message })

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', userId)

    if (profileError) return res.status(400).json({ error: profileError.message })

    res.json({ success: true, message: 'Contraseña actualizada correctamente.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Exportar para Vercel Serverless
export default app
