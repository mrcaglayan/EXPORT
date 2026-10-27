import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import AppLayout from '@/layouts/AppLayout'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import ProductsPage from '@/pages/products/ProductsPage'
import InventoryPage from '@/pages/inventory/InventoryPage'
import ExportsPage from '@/pages/exports/ExportsPage'
import VatPage from '@/pages/vat/VatPage'
import AccountingPage from '@/pages/accounting/AccountingPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import NotFoundPage from '@/pages/NotFoundPage'
import AuthProvider from '@/auth/AuthProvider'
import RequireAuth from '@/auth/RequireAuth'
import RequirePermission from '@/auth/RequirePermission'
import LoginPage from '@/auth/LoginPage'
const PurchasingPage = lazy(() => import('@/pages/purchasing/PurchasingPage'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<RequirePermission permission="workspace.read"><DashboardPage /></RequirePermission>} />
          <Route path="products" element={<RequirePermission permission="products.read"><ProductsPage /></RequirePermission>} />
          <Route path="inventory" element={<RequirePermission permission="inventory.read"><InventoryPage /></RequirePermission>} />
          <Route path="purchasing" element={<RequirePermission permission="purchasing.read"><Suspense fallback={<p role="status">Loading purchasing…</p>}><PurchasingPage /></Suspense></RequirePermission>} />
          <Route path="exports" element={<RequirePermission permission="exports.read"><ExportsPage /></RequirePermission>} />
          <Route path="vat" element={<RequirePermission permission="vat.read"><VatPage /></RequirePermission>} />
          <Route path="accounting" element={<RequirePermission permission="accounting.read"><AccountingPage /></RequirePermission>} />
          <Route path="settings" element={<RequirePermission permission="settings.read"><SettingsPage /></RequirePermission>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        </Route>
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
